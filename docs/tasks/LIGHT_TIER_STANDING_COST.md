# Implementation Plan: The Light Tier's Standing Cost — What Light Still Carries on the Phone

Source spec: [docs/specs/LIGHT_TIER_STANDING_COST.md](../specs/LIGHT_TIER_STANDING_COST.md). Source intent:
[docs/intent/light-tier-standing-cost.md](../intent/light-tier-standing-cost.md). Backlog slot: this is backlog
[27](../todo/backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included)'s own fix (spec §7 Q6), plan.md
Stage 1. Docs branch `docs/backlog-27-intent` (this file, the intent, the spec); build branch
`perf/light-tier-standing-cost` off `main` once the docs merge, else off the docs branch.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run build && npx vite preview --port 4173`, `npm run perf:audio`, `npm run perf:audio-handlers` (T2, new).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

Three gated phases and a docs tail. **Phase A** builds two small measurement tools (a per-handler trace breakdown with
a unit-tested tally, and a census line on `perf:audio`), then runs them: the breakdown on D1 and D5 at Light, the lit
effects of each world read from the running app, and eight ablation A/Bs on throwaway builds; it ends in one dated
section of `scratchy-audio-phones.md` with a decision table for **Gate A**, where Crawford picks the cuts. **Phase B**
is the inaudible batch Gate A picked (2026-10-28): standing-by voices released (H2) and the dark cells' and the
drift's LFOs stopped (H3), each a RED test, the build and a same-session desktop A/B, kept or dropped on its number;
it ends at **Gate B**, Crawford's desktop listen. **Phase C** is the Pixel sitting, **Gate C** = clean by ear at Light
on D1 and D5. Only on a miss, **Phase C2** builds three audible Light-only cuts in Gate A's order (pedals off, a
shorter Reverb, three sounding robots), each on the one before, and one sitting tries them stacked (**Gate C2**: the
first clean build wins). Docs last. Every task names its **Proof**
(TASK_TEMPLATE.md): RED tests where behaviour changes, a run for every measurement, a Read for records and docs. No
file-text tests, no docs guards (CLAUDE.md, 2026-10-23). One commit per task; throwaway ablation builds are never
committed.

## Architecture Decisions

- **Resolves spec §7 Q1 (is the trace category live?) by T2's first run, with the fallback built in.** The runner
  requests `webaudio` and `disabled-by-default-webaudio.audionode`; if the trace carries `Render` events but no
  per-handler `Process` events, the tally reports that in words and T4 records the breakdown as unavailable, and the
  decomposition rests on the ablations (T6, T7) and the census (T3), with September's ~1–2 µs/node/quantum flagged as
  stale. No separate task for the question.
- **The runner reuses the harness, it does not fork it.** `audio-load.mjs`'s open-the-world sequence (Chrome via
  `withChrome`, `WebAudio.enable` before navigation, power on, the pin check, the warm-up) moves into `cdp-lib.mjs` as
  one exported helper that `audio-load.mjs` then calls; `audio-handlers.mjs` calls the same helper and adds only the
  `Tracing.start` / `Tracing.end` pair in `profile.mjs`'s shape. `perf:audio`'s behaviour is unchanged, proven by a
  smoke run in T2's verification (the harness is the instrument of everything after, so it must not drift).
- **Shares, never absolute cost, from the breakdown.** The tally divides each handler class's self time by the
  `RealtimeAudioDestinationHandler::Render` total of the same trace, so the ~3× tracing inflation cancels; the runner
  prints only shares, counts and a per-node share, and says so in its header.
- **Ablation runs are 120 s, not 240 s** (a deviation from spec §1.2, Open Question 8 below). Eight ablations × two
  worlds × three interleaved rounds × stock-and-variant is 96 runs; at 240 s that is about eight hours of foreground
  runs across many sessions, and the 2026-09-20 LFO-cost method ranked pieces reliably on 20 s windows. 120 s after the
  8 s warm-up keeps the bucket structure (15 s) and halves the series; the full 240 s stays for Phase B's A/Bs, where a
  kept cut is proven. The stock build's own round-to-round spread at 120 s is re-established first (T6's first pair)
  and is the noise band every delta is read against.
- **Each ablation is a named edit, listed in the record, never committed.** The variant is built from the stock commit
  with one `src/` edit (named in the record by file and line), `vite build --outDir` into the session scratchpad, served
  beside stock (`@page` spec), `src/` restored and `git status` clean before the next. The PERFORMANCE.md "Patch recipe"
  shape.
- **H1's hold-off keeps the stored Mix in `globalFx.ts`, not in the cell.** Each Mix setter already calls
  `writeCellMix(key, wet)` with the slider value; T11 has each setter record `lastMix[key]` first and write the cell
  only while not held off, and `setEffectsHeldOff(true)` writes every cell to 0 while `(false)` writes `lastMix` back —
  one source of truth for "what the user set", and the crossing stays `writeCellMix`'s own (its ramp, its audio-clock
  timer, its re-light cancel). The Width cell's "dark" is 0.5, so the hold-off writes `0.5` to it, not `0`.
- **H1's threshold is `LOAD_EFFECTS_MIN = 0.4`** (spec §7 Q2; Gate A: built only on a phone miss): Light holds
  every effect off, Standard and Full keep theirs — the filter tier's placement. Raising it, so Standard holds effects
  off too, is out of this work (Gate A).
- **H2 builds a robot's voice on entry to the sounding set** (spec §7 Q3, recommendation adopted): `audioBudgetSystem`'s
  `applySet` diffs the old and new sets; a robot leaving gets the existing `AudioEngine.releaseVoice` and
  `lfoEngine.disposeRobotLinks`-equivalent through the one helper `localeStore`'s remove path already uses; a robot
  entering gets `rebuildVoice`'s pair (`reReserveVoice` + `primeRobotLinks`, the pair `applyLayersStructural` uses).
  A `null` set (Full, or the budget stopped) releases nothing and re-reserves everything released, so Full is
  unchanged by construction. The set changes on the measure tick, ahead of the admitted robot's first trigger by more
  than `MIN_LEAD`. A warm pool is not built.
- **H3's stop/start lives inside the crossing.** `writeCellMix`'s connect path starts the effect's LFOs before the
  edge is made and its disconnect timer stops them after the edge is dropped, so a cell's "in the path" and "running"
  cannot drift apart; the effect's LFOs are found once at build (`Tone.Chorus`/`Tremolo`/`Vibrato`/`Phaser` expose
  theirs; the AutoWah's follower is not an LFO and is left alone). The drift secondaries stop and start in
  `setDriftEnabled` beside the Gain detach/attach that already lives there.
- **Gate A's order (2026-10-28,** the intent's "Gate A — the cuts"). Inaudible first and alone (Phase B: H2, H3a,
  H3b), then the phone; only on a miss, the three audible Light-only cuts, stacked, in one sitting (Phase C2). The task
  numbers stay as first written so earlier references hold: T9–T13 (H1) and T19 (now the Reverb cap) sit in Phase
  C2, and T24–T28 are new.
- **Order.** T0 first so the docs point at the plan from the first commit. T1 → T2 → T3 (tooling, each needing the
  one before only where it imports it) → Checkpoint A1 (the tools work on one smoke run) → T4, T5 in either order → T6
  → T7 (the ablations share the stock build and the noise band) → T8 the decision table → Gate A. Phase B: T14 → T15, then T16, T17 →
  T18 (independent of each other; H2 first as the biggest). Phase C needs every kept cut. Phase C2, only on a miss:
  T9 → T10 → T11 → T12 → T13 → T19 → T24 → T25 → T26 → T27 → T28, each cut on the one before. Docs last.

## Dependency Graph

```
T0 (docs slot)
   │
T1 (audio-handlers-lib + tests) ──► T2 (audio-handlers runner; cdp-lib helper; perf:audio unchanged)
                                        │
T3 (census line on perf:audio) ─────────┤
                                        │
                              Checkpoint A1 (tools work; Q1 answered)
                                        │
                         ┌──────────────┼──────────────┐
                   T4 (breakdown)  T5 (lit effects)  T6 (ablations A1–A4, + the census and the noise band)
                         │              │              │
                         │              │          T7 (ablations A5–A8)
                         └──────────────┴──────────────┘
                                        │
                           T8 (Phase A section + decision table)
                                        │
                              Gate A — Crawford picks the cuts (2026-10-28)
                                        │
                  H2: T14 → T15    H3: T16, T17 → T18     (Phase B, the inaudible batch)
                                        │
                              Gate B — Crawford's desktop listen
                                        │
                         T20 (the sitting, prepared) → T21 (the sitting, recorded) → Gate C
                                        │
                ┌──────────── clean ────┴──── miss ─────────────┐
                │                                               │
                │     Phase C2: H1 T9 → T10 → T11 → T12 → T13 → Reverb cap T19 → T24
                │               → three robots T25 → T26 → T27 (stacked builds) → T28 → Gate C2
                │                                               │
                └───────────────────────┬───────────────────────┘
                                        │
                         T22 (PERFORMANCE.md, AUDIO_SYSTEM.md) → T23 (backlog 27, plan.md)
                                        │
                              Checkpoint: Complete
```

## Task List

### Phase 0: The slot

- [x] **Task 0: `docs/specs/LIGHT_TIER_STANDING_COST.md`, `docs/todo/plan.md`, `docs/todo/backlog.md` — the pointers** (2026-10-27)

  **Description:** The spec's **Status** line records approval and links this plan; plan.md's Stage 1 line for 27
  gains the spec and plan links (one sentence, the stage's wording kept); backlog 27's last update ("the sitting is
  done") gains one pointer sentence to the spec. Nothing else changes.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] The three files link to each other as above; no number is assigned (spec §7 Q6).

  **Verification:**
  - [ ] Manual read; `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `docs/specs/LIGHT_TIER_STANDING_COST.md`, `docs/todo/plan.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (docs only)

---

### Phase A1: The tools

- [x] **Task 1: `scripts/perf/audio-handlers-lib.mjs` — the per-handler tally, pure** (2026-10-27)

  **Description:** A pure module in the `audio-load-lib.mjs` shape. `tallyHandlers(events)` takes raw trace events and
  returns `{ renderTotalUs, renderCount, classes: [{ name, selfUs, share, instances, perInstanceShare }], note }`:
  only events on the audio thread (the thread that carries `RealtimeAudioDestinationHandler::Render`); a class is a
  `Process`-shaped event's name with its instance stripped (`GainHandler::Process` and the like), its self time the
  event's `dur` less the `dur` of events nested inside it on the same thread; `share` is self time over the `Render`
  total of the same trace; `instances` counts distinct handler ids (the event's `args` id, or name+tid+depth when there
  is none) and `perInstanceShare = share / instances`; sorted by share. `formatHandlerTable(tally)` renders the table
  the runner prints. `note` is the fallback text when `Render` events exist but no per-handler events do (Architecture
  Decisions, Q1), and a different text when no `Render` events exist at all.

  **Proof:** RED test — `scripts/perf/audio-handlers-lib.test.mjs`: on a hand-built event list (two `Render`
  quanta, three handler classes, one nested pair, one event on another thread), the self times, shares, instance counts
  and sort order; the two notes; an empty list gives an empty table and no NaN.

  **Acceptance criteria:**
  - [ ] Nested handler time is counted once (self time, not inclusive).
  - [ ] Shares sum to the handler fraction of `Render`, never over 1; an event off the audio thread is ignored.
  - [ ] The three degenerate inputs (no events; `Render` only; no `Render`) each produce a table and a note, no throw.

  **Verification:**
  - [ ] `npx vitest run scripts/perf/audio-handlers-lib.test.mjs` passes (RED first, then green); the mutation gate on the tally.
  - [ ] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `scripts/perf/audio-handlers-lib.mjs`, `scripts/perf/audio-handlers-lib.test.mjs`

  **Estimated scope:** S (two new files, pure)

- [x] **Task 2: `scripts/perf/audio-handlers.mjs`, `scripts/perf/cdp-lib.mjs`, `scripts/perf/audio-load.mjs`, `package.json` — the runner, on the shared open-the-world helper** (2026-10-27)

  **As built (2026-10-27).** Q1: the category is **live** on headless Chrome. Each node traces one
  `AudioHandler::ProcessIfNecessary` per quantum (`args.this`, `args['node type']`), and some handlers trace their
  own step inside it (`GainHandler::Process`, mostly with no args); the T1 follow-up commit counts a step toward its
  node. Two deviations for T4: (1) the window is **8 s, not 60 s** — Chrome's trace buffer filled at ~9 s on D1 at
  Light (~4 million events, data lost on a 10 s window), so `--seconds` defaults to 8 and the run prints "DATA LOST"
  and the Render span when it overflows; (2) tracing **saturates** the audio thread (Render busy 100 % of the span,
  5.0 ms per 128-frame quantum), so quanta are dropped and the trace's own per-event cost weighs most on classes with
  many cheap instances (909 Gains, 329 ConstantSources) — T4 reads the shares with that, beside the ablations.
  The helper is `withPoweredWorld` in `cdp-lib.mjs`.

  **Description:** Move `audio-load.mjs`'s open-the-world sequence (fresh Chrome via `withChrome`, `WebAudio.enable`
  before navigation, navigate to the world URL with `?debug`, power on, the pin check, the warm-up wait) into one
  exported `cdp-lib.mjs` helper that returns the session handles and the context id; `audio-load.mjs` calls it with no
  behaviour change. `audio-handlers.mjs` calls the same helper, then `Tracing.start` with
  `['webaudio', 'disabled-by-default-webaudio.audionode']` (`transferMode: 'ReportEvents'`, `profile.mjs`'s
  `captureTrace` shape), waits `--seconds` (default 60), `Tracing.end`, tallies with T1 and prints the header ("shares of
  Render; tracing inflates load ~3×, read proportions only"), the overlay's carried line, the table and the note; flags
  `--world`, `--seconds`, `--url`, `--chrome`, `--port`, `--help`, `--json`. `package.json` gains
  `"perf:audio-handlers": "node scripts/perf/audio-handlers.mjs"`.

  **Proof:** A run (plumbing is verified by runs, the backlog 30/31 precedent): `npm run perf:audio-handlers -- --world
  "<D1 spec at Light>" --seconds 30` against a served production build prints a table, or the Q1 fallback note.

  **Acceptance criteria:**
  - [ ] `npm run perf:audio -- --world "<D1 spec at Light>" --seconds 30` prints the same columns and the carried
        overlay line as before the move (a smoke run, numbers inside the usual spread).
  - [ ] The handler run prints shares, instance counts and per-instance shares, or the fallback note; `--help` lists
        every flag; the pin check aborts on a world mismatch as `perf:audio`'s does.
  - [ ] Spec §7 Q1 is answered in the commit message (category live, or fallback).

  **Verification:**
  - [ ] The two runs above, foreground, orphaned Chrome 0 before and after, recorded in the commit.
  - [ ] `npx vitest run scripts/perf` passes (the lib tests; no new test for the plumbing); `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `scripts/perf/audio-handlers.mjs`, `scripts/perf/cdp-lib.mjs`, `scripts/perf/audio-load.mjs`, `package.json`

  **Estimated scope:** M (one new runner, one helper extracted, one script line)

- [x] **Task 3: `scripts/perf/audio-load-lib.mjs`, `scripts/perf/audio-load.mjs` — the census line** (2026-10-27)

  **Description:** `formatCensus(liveByType)` in the lib renders the full live-nodes-by-type snapshot as one line
  (`census after warm-up (1812): Gain 611 · ConstantSource 290 · BiquadFilter 41 · …`, largest first, the total in
  brackets). `audio-load.mjs` prints it once, right after the `carried after warm-up:` overlay dump, from the
  `nodesAtStart` snapshot it already takes; the JSON output carries it under `nodesByType.atStart` as today.

  **Proof:** RED test — `scripts/perf/audio-load-lib.test.mjs`: `formatCensus` on a three-type snapshot gives the line
  above; an empty snapshot gives `census after warm-up (0): none`.

  **Acceptance criteria:**
  - [ ] The line appears once per run, before the bucket table, and matches the JSON's `atStart`.

  **Verification:**
  - [ ] `npx vitest run scripts/perf/audio-load-lib.test.mjs` passes; `npm run lint` clean.
  - [ ] One 30 s smoke run shows the line.

  **Dependencies:** Task 2 (the helper move lands first so the two edits to `audio-load.mjs` do not collide).

  **Files:** `scripts/perf/audio-load-lib.mjs`, `scripts/perf/audio-load-lib.test.mjs`, `scripts/perf/audio-load.mjs`

  **Estimated scope:** XS

### Checkpoint A1: The tools work
- [x] `npm run build:types`, `npm run lint`, `npx vitest run scripts/perf` clean.
- [x] One handler run and one `perf:audio` run on D1 at Light both complete against the served production build; Q1's
      answer (category live, or the fallback) is written in T2's commit and carried into T4.
- [x] Reviewed with human before the runs (the runs are long; the tool should not change under them). (Crawford's go-ahead for Phase A2, 2026-10-27)

---

### Phase A2: The runs

Common to T4–T7: production build of the build branch's stock commit, `vite preview` on :4173 (a second port for a
variant), D1 and D5 pinned by their world links at `?load=light` (PERFORMANCE.md "The seven links"), foreground, one
call at a time (≤ 2 four-minute runs per call; 120 s runs allow 4), orphaned Chrome 0 before and after, the phone
preview servers idle. Every number recorded with its spread and the commit it was measured on.

- [x] **Task 4: `docs/todo/scratchy-audio-phones.md` — the handler breakdown, D1 and D5 at Light** (2026-10-27)

  **Description:** Three 60 s handler runs per world, interleaved (D1 D5 D1 D5 D1 D5). Record the per-class shares
  (median and min–max over the three), instance counts and per-instance shares as one table per world in a new section
  "Backlog 27, the decomposition" (opened by this task; T5–T8 add to it), with the reading: which handler classes carry
  the thread at Light, and what one Gain, one biquad, one oscillator, one ConstantSource costs relative to `Render`. If
  Q1 fell back, the section says so and the table is absent.

  **Proof:** A run (six), recorded. No test file.

  **Acceptance criteria:**
  - [ ] Two tables with spreads, or the fallback statement; the builds named by commit; the hygiene line (foreground,
        orphan count) stated.

  **Verification:**
  - [ ] The record reads back against the runs' saved `--json` files (kept in the session scratchpad, paths in the record).

  **Dependencies:** Checkpoint A1.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** S (one docs section; ~40 minutes of runs)

- [x] **Task 5: `docs/todo/scratchy-audio-phones.md` — fact (a): what D1 and D5 light** (2026-10-27)

  **Description:** On `npm run dev` in headless Chrome, a fresh page per world, over CDP `Runtime.evaluate` with
  dynamic imports of the app's own modules (the "seven links" recipe): read `useAudioStore.getState().globalAudio` for
  the ten effects' Mix (`distortion.wet`, `chebyshev.wet`, `bitCrusher.wet`, `autoWah.wet`, `phaser.wet` + `stages`,
  `tremolo.wet`, `vibrato.wet`, `chorus.wet`, `frequencyShifter.wet`, `stereoWidener.width`) and the active locale's
  robots' five sends, and derive: which chain cells are lit, which rooms are fed, so which branches are lit — matching
  the overlay's `fx in 5/10`. One table per world in the T4 section. A throwaway probe script in the session scratchpad;
  nothing committed but the record.

  **Proof:** A run, recorded. No test file.

  **Acceptance criteria:**
  - [ ] Each world's lit list sums to the overlay's `fx in` count; the Phaser's stage count and every lit Mix value
        are in the table.

  **Verification:**
  - [ ] The counts match the overlay line printed by T4's runs.

  **Dependencies:** Checkpoint A1 (for the record's section; the probe itself needs nothing from T1–T3).

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS

- [x] **Task 6: `docs/todo/scratchy-audio-phones.md` — ablations A1–A4, with the noise band and the census** (2026-10-28)

  **Description:** First the **noise band**: stock against stock, both ports serving the same build, three interleaved
  pairs per world at 120 s — the spread of the same-round difference is the band every delta below is read against.
  Then four throwaway variants, each one named `src/` edit on the stock commit, built to the scratchpad and served on
  the second port, three interleaved rounds against stock per world at 120 s, the **same-round difference in mean
  capacity** recorded with peak window and `max lag` beside (the 2026-09-20 method):
  - **A1** every bypass effect dark at power-on (`applyGlobalAudioToEngine` writes every Mix as 0 and Width as 0.5).
  - **A2** the eight standing-by robots' voices released once the sounding set settles (a one-off `releaseVoice` for
    every robot outside the set, from `applySet`).
  - **A3** every cell's effect LFOs stopped after build (`.stop()` on each Chorus/Tremolo/Vibrato/Phaser LFO), the
    Mixes untouched.
  - **A4** the four lanes and their drift secondaries stopped after `primeLfoBank`.
  The stock runs' **census line** (T3) for each world is recorded here too. Each variant's edit is named by file and
  the lines changed; `src/` restored and `git status` clean before the next build.

  **Proof:** A run (noise band 12 runs; four variants × 12 runs), recorded. No test file.

  **Acceptance criteria:**
  - [x] The noise band is stated per world before any delta; each delta is read as above, inside or below the band.
  - [x] Each variant's edit is reproducible from the record; nothing of it is committed.

  **Verification:**
  - [x] `git status` clean after the task; the record's numbers trace to the saved `--json` files.

  **Dependencies:** Task 3 (the census line), Checkpoint A1.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** M (one docs section; ~60 runs of 2 min, split across sessions as needed)

- [x] **Task 7: `docs/todo/scratchy-audio-phones.md` — ablations A5–A8** (2026-10-28)

  **Description:** As T6, four more variants against the same stock build and noise band:
  - **A5** the Reverb room unbuilt (its send gains made, its `in` connected to nothing).
  - **A6** EQ3, LPF and HPF removed from the chain (entry cut → filter cut), their LFO links unlinked.
  - **A7** the Compressor, Limiter and ceiling removed (the Width cell → masterGain).
  - **A8** the five send gains per robot not built and the five rooms unbuilt (the robots dry).
  Then the **sum**: each piece's delta, the stock mean, the sum of deltas, and the share of the stock mean it explains,
  per world (spec §1.2's 70 % criterion, reported either way).

  **Proof:** A run (four variants × 12 runs), recorded. No test file.

  **Acceptance criteria:**
  - [x] Eight deltas per world with spreads; the sum and its share stated; "below noise" used where a delta sits
        inside the band.

  **Verification:**
  - [x] As T6.

  **Dependencies:** Task 6.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** M

- [x] **Task 8: `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md` — the decision table for Gate A** (2026-10-28)

  **Description:** Close the "Backlog 27, the decomposition" section with the **decision table** (spec §1.2): one row
  per piece — its breakdown share, its ablation delta on D1 and D5, the census count behind it, the cut it implies
  (spec §1.3), audible or not, the tier it would take, and a recommended order biggest-first. State whether the 70 %
  criterion was met and, if not, what is unexplained. Add one update line on backlog 27 pointing at the section.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] Every row's numbers trace to T4–T7; the recommended order is stated with its reason; a piece below noise is
        marked as not worth a cut.

  **Verification:**
  - [x] Manual read; `npm run lint` clean. (Lint run 2026-10-28; the read is Gate A's first box.)

  **Dependencies:** Tasks 4, 5, 6, 7.

  **Files:** `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS

### Gate A: Crawford picks the cuts
- [x] The decision table read; the cuts to build named, in order, and the dropped ones marked in the table with the
      reason (below noise, audible and not wanted, out of scope). (2026-10-28: the intent's "Gate A — the cuts";
      marked in the record's decomposition §7.)
- [x] If the ablations explain under 70 % of the stock mean: chase the remainder (a further ablation task appended
      here) or cut what is priced — Crawford's call, recorded on backlog 27. (Chased, Crawford 2026-10-28: Task 8a.)
- [x] Phase B's tasks below re-ordered to the picked order; any H5 piece written into T19. (2026-10-28: Phase B =
      H2, H3; H1 and the Reverb cap, T19, moved to Phase C2 with the sounding cap, T25.)
- [x] No product code has changed; `git status` clean on the build branch. (2026-10-28)

- [x] **Task 8a: `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md` — ablation A9, the robots against the floor** (2026-10-28)

  **Description:** Appended at Gate A. One more throwaway variant, A9: `reserveVoice` refuses every robot, so no robot
  has a voice and the base chain, effects and bank stay. A fresh noise band first (NB2, a new sitting), then three
  interleaved rounds per world at 120 s, as T6. Recorded as §6 of the decomposition section, with the split of the
  robots' share and the row it adds to the decision table.

  **Proof:** A run (24 runs), recorded. No test file.

  **Acceptance criteria:**
  - [x] The fresh noise band stated before the delta; the floor and the robots' share stated per world.

  **Verification:**
  - [x] `git status` clean after the task; the numbers trace to the saved `--json` files.

---

### Phase B: The inaudible batch (Gate A, 2026-10-28: H2, then H3; every tier)

Gate A's order (the intent's "Gate A — the cuts"): only cuts nobody can hear, alone, each kept or dropped on its own
A/B, then the phone. The audible cuts (H1, the Reverb cap, three sounding robots) wait for a Gate C miss (Phase C2).

**H2 — standing-by voices released** (spec §1.3 H2; inaudible at Full → every tier by construction)

- [ ] **Task 14: `src/systems/audioBudgetSystem.ts`, `src/engine/AudioEngine.ts` — release on leaving, re-reserve on entering**

  **Description:** `applySet(next)` diffs `sounding` against `next`: for each robot that left, the one voice-teardown
  helper `localeStore`'s remove path uses (`AudioEngine.releaseVoice` plus the robot's links disposed); for each that
  entered, `rebuildVoice`'s pair (`reReserveVoice` from the robot's stored layers, sends, bus filter and portamento,
  then `primeRobotLinks`). `setSoundingRobots(null)` (and `stopAudioBudget`) re-reserves every robot the system
  released, so Full and a stopped budget carry every chain as today. A robot released while a note sounds: its release
  waits for `scheduleVoiceRelease`'s tail (the voice counter never strands) — or, if that path cannot be reused
  cleanly, the release is deferred to the next measure tick; the plan pins whichever the build finds, in the test.
  `triggerWithCap` on a standing-by robot still returns false before any build. Mute/solo paths unchanged.

  **Proof:** RED test — `src/systems/audioBudgetSystem.test.ts` (the engine mocked): a set change from `[a,b,c,d]` to
  `[a,b,c,e]` releases `d` once and re-reserves `e` once with its stored fields, before any trigger; a `null` set
  re-reserves `d`; `stopAudioBudget` re-reserves everything released; a set with no change releases and reserves
  nothing; a soloed robot's admission evicts and releases the newest non-solo. `src/engine/AudioEngine.test.ts`: the
  voice counter after a release mid-note.

  **Acceptance criteria:**
  - [ ] No robot is ever released while in the set or re-reserved while out of it; Full's graph is byte-for-byte the
        roster's (pinned by the node-count case in `AudioEngine.test.ts`); existing tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts src/engine/AudioEngine.test.ts` passes; the mutation gate
        on the diff; `npm run build:types`, `npm run lint` clean.
  - [ ] Manual: `?debug&load=light` on D1 — the overlay's node count falls after the warm-up and rises by one chain on
        an admission; no click at the admitted robot's first note on speakers.

  **Dependencies:** Gate A.

  **Files:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`, `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M (two modules; the re-reserve path exists, the diff and the timing are new)

- [ ] **Task 15: `docs/todo/scratchy-audio-phones.md` — H2's A/B**

  **Description:** Spec §1.5 steps 3–4 for H2: the branch (T14 in) against its base, same session, three interleaved
  rounds, D1 and D5 at Light, 240 s, kept on A2's price less the noise band with the peak window not rising and `max lag`
  inside the base's spread; one Full run per world inside the base's spread (nothing is released at Full); and the admission crossing through
  the recorder recipe on a robot entering the set (≤ ×1.6, no gap, no late first note: the first trigger's time against
  its scheduled time). Decision table updated.

  **Proof:** A run, recorded. No test file.

  **Acceptance criteria:**
  - [ ] The four numbers (mean delta, peak, `max lag`, Full) and the admission timing figure stated with spreads; the
        verdict is Crawford's on them.

  **Verification:**
  - [ ] Hygiene as Phase A2; the record traces to the JSON files.

  **Dependencies:** Task 14.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** S

**H3 — oscillators that run for nothing** (spec §1.3 H3a, H3b; inaudible → every tier)

- [ ] **Task 16: `src/engine/audioEngine/bypassCell.ts`, `globalFx.ts` — a dark cell's LFOs stopped**

  **Description:** `buildCell`/`buildBranch` record the effect's LFOs on the `Cell` (`lfos: Array<{ start, stop }>`,
  found once at build from Tone's own fields: the Chorus's and Tremolo's two, the Vibrato's one, the Phaser's two; the
  others empty) and stop them at build, since every cell is built dark. `connectEffect` starts them before the edge is
  made; the darken timer in `writeCellMix` stops them after `disconnectEffect`; a re-light that cancels the timer
  leaves them running. `rebuildPhaser` carries the new node's LFOs into the cell. The Vibrato's `start()` in Tone's
  constructor is undone by the build-time stop and restored by the first light.

  **Proof:** RED test — `src/engine/audioEngine/bypassCell.test.ts`: after build every recorded LFO has `stop` called
  once; Mix 0 → 0.3 calls `start` before `connect`; 0.3 → 0 calls `stop` only when the timer fires, after
  `disconnect`; 0.3 → 0 → 0.2 before the timer calls no `stop`; an effect with no LFO is unaffected; the Phaser
  rebuild swaps the recorded LFOs. The existing crossing cases pass unmodified.

  **Acceptance criteria:**
  - [ ] "In the path" and "running" never differ once a timer has fired; a lit effect's sound is unchanged (the LFO
        restarts at phase 0 while the cell is still silent).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts` passes;
        `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate A.

  **Files:** `src/engine/audioEngine/bypassCell.ts`, `src/engine/audioEngine/bypassCell.test.ts`, `src/engine/audioEngine/globalFx.ts`

  **Estimated scope:** S

- [ ] **Task 17: `src/engine/lfoEngine.ts` — the drift secondaries stopped while drift is held off**

  **Description:** `setDriftEnabled(false)` calls `stop()` on each lane's drift secondary beside detaching its two
  Gains; `(true)` starts them beside re-attaching; idempotent; a lane primed while drift is held off is primed stopped;
  `refreshLaneDrift` is untouched.

  **Proof:** RED test — `src/engine/lfoEngine.test.ts` (the Tone.LFO mock, instances scoped to the test): after
  `primeLfoBank` then `setDriftEnabled(false)` each secondary's `stop` is called once; `(false)` again calls nothing;
  `(true)` calls `start` once; priming after `(false)` leaves the secondaries stopped; the lane LFOs themselves are never
  stopped.

  **Acceptance criteria:**
  - [ ] The lanes keep running at every tier; only the four secondaries stop; the drift amounts stored are untouched.

  **Verification:**
  - [ ] `npx vitest run src/engine/lfoEngine.test.ts` passes; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate A.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** XS

- [ ] **Task 18: `docs/todo/scratchy-audio-phones.md` — H3's A/Bs**

  **Description:** One A/B per cut (T16's commit against its base, T17's against its base), as T15: Light and Full
  runs, kept on A3's / A4's price less noise on D1 and, on D5 where Phase A read both below noise, on D5 reading inside
  its band (spec §1.5 step 3); for T16 the light crossing through the recorder on a Phaser and a Chorus
  (≤ ×1.6, no gap). Decision table updated.

  **Proof:** A run, recorded. No test file.

  **Acceptance criteria:**
  - [ ] As T15, per cut, with T16's crossing figure.

  **Verification:**
  - [ ] Hygiene as Phase A2; the record traces to the JSON files.

  **Dependencies:** Tasks 16, 17.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** S

### Gate B: Crawford's desktop listen (spec §5.3)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (full suite; any pre-existing,
      unrelated failure named).
- [ ] D1 and D5 at Full and at Light: nothing changed by ear, no click at any note, the Audio Load panel as before.
- [ ] At Light: no click when a robot is admitted or stands down; a dark pedal lit from its Mix (0 → 0.3) and back
      without a click; Robot Load and Effects Load dragged across their thresholds both ways (drift back on and off);
      save, reload and a share link across them.
- [ ] Every kept cut's row in the decision table says "kept" with its number; every dropped one "dropped" with its.

---

### Phase C: The phone

- [ ] **Task 20: the sitting, prepared**

  **Description:** Two production builds on the LAN, each on its own port (browser storage apart): the branch at Gate
  B's commit and `main` at its merge-base; a `phone.html` links page in each `dist` with D1 and D5 at
  `?debug&load=light` and at `?debug&load=full`; every link loaded headlessly over the LAN address first (pin check,
  powered on, `load 20%·fx 20%`, `latency playback`, `fin ok`, and on the branch the standing-by voices released: `perf:audio`'s census line about 680 nodes under
  `main`'s on D1 and 500 on D5).
  The commands, cleanup included, in the session scratchpad's `commands.txt` (the 2026-10-26 recipe).

  **Proof:** A run (the headless pre-checks). No test file.

  **Acceptance criteria:**
  - [ ] Eight links pre-checked; the branch's Light links show the lower census.

  **Verification:**
  - [ ] The pre-check lines pasted into the record's draft.

  **Dependencies:** Gate B.

  **Files:** none in the repo (scratchpad only)

  **Estimated scope:** XS

- [ ] **Task 21: `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md` — the sitting, recorded (Gate C)**

  **Description:** Crawford's runs: rested Pixel 8, a fresh tab per run, hands off to 3:00, read at 4:00 — the branch
  on D1 and D5 at Light (twice each if time allows), `main` once per world at Light in the same sitting, the branch once
  per world at Full by ear. Recorded as the closing section of backlog 27 in the sitting's table shape (build, world,
  count 3:00 → 4:00, collapse?, Crawford's words), with the reading against the two baseline sittings. **Pass:** clean
  by ear on D1 and D5 at Light for four minutes, Full unchanged by ear; the count recorded, not gated. On a miss: Phase C2 (spec
  §1.6), the three audible cuts built and tried stacked in one sitting.

  **Proof:** A run (Crawford's), recorded. No test file.

  **Acceptance criteria:**
  - [ ] Gate C's verdict stated in Crawford's words, per run; the deviations (one run per cell, rest untimed) listed.

  **Verification:**
  - [ ] Manual read; `npm run lint` clean.

  **Dependencies:** Task 20.

  **Files:** `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (the record; the runs are Crawford's)

### Gate C: The phone is clean
- [ ] Clean by ear on D1 and D5 at Light, rested Pixel 8, four minutes; Full unchanged.
- [ ] On a miss, Phase C2 is built and its sitting (T27–T28) decides at Gate C2; past its last build the item returns
      to Crawford with the floor's numbers (spec §1.6).

---

### Phase C2: Only on a Gate C miss — the audible cuts for Light, stacked

Gate A's order (2026-10-28): decoration before the music. Three Light-only cuts, each built on the one before with its
own RED tests and desktop A/B: pedals off (H1, T9–T13), a shorter Reverb (T19, T24), three sounding robots (T25, T26).
Then one rested sitting tries the three stacked builds in that order and stops at the first clean one (T27, T28, Gate
C2). None of it starts unless Gate C misses.

**H1 — the effects tier** (spec §1.3 H1; audible → Light only)

- [ ] **Task 9: `src/constants/index.ts`, `src/utils/audioBudget.ts` — `LOAD_EFFECTS_MIN` and `effectsEnabled`**

  **Description:** `LOAD_EFFECTS_MIN = 0.4` beside the three LFO thresholds, with the one-line comment the others
  carry; `EffectsLoadLimits` gains `effectsEnabled: load >= LOAD_EFFECTS_MIN`; `describeLimits` adds `pedals or
  colour` to its `no …` list when the flag is off (the phrase through the content layer, as the existing words are).

  **Proof:** RED test — `src/utils/audioBudget.test.ts`: `effectsLoadToLimits(0.2).effectsEnabled` is false, `(0.4)`,
  `(0.6)` and `(1)` true; `describeLimits` with it off names it; the existing cases pass unmodified.

  **Acceptance criteria:**
  - [ ] Light reads effects off, Standard and Full on; the readout names it; the preset buttons' values are untouched.

  **Verification:**
  - [ ] `npx vitest run src/utils/audioBudget.test.ts` passes; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate C missed.

  **Files:** `src/constants/index.ts`, `src/utils/audioBudget.ts`, `src/utils/audioBudget.test.ts`, `src/content/…` (the phrase)

  **Estimated scope:** XS

- [ ] **Task 10: `src/engine/audioEngine/globalFx.ts` — `setEffectsHeldOff` and the stored Mix**

  **Description:** A module-level `lastMix: Partial<Record<BypassKey, number>>` that every Mix setter writes before
  it calls `writeCellMix` (Width records its width); the setters call `writeCellMix` only while not held off.
  `setEffectsHeldOff(heldOff)`: on `true`, `writeCellMix(key, 0)` for every chain cell and room branch (Width `0.5`),
  through the ordinary crossing; on `false`, `writeCellMix(key, lastMix[key])` for each; idempotent on a re-send;
  `getEffectsHeldOff()` for the diagnostics. Room liveness (`setRoomFed`) is untouched: a held-off branch is dark, so
  a fed room costs what a dark one costs. `disconnectAllFxNodes`/`wireGlobalFxChain` (a Decay flip) re-wire cells "as
  they were", which with every cell dark means nothing lit — pinned.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts` (the existing connect/disconnect spies and the
  audio-clock timer fake): two lit cells and a lit branch → `setEffectsHeldOff(true)` ramps each to dry and
  disconnects each when its timer fires, Width to 0.5; a Mix write while held off records the value and connects
  nothing; `(false)` lights exactly the recorded Mixes through the connect path; a re-sent `true` writes nothing; a
  Decay flip while held off connects no effect; `applyGlobalAudioToEngine` while held off connects nothing.

  **Acceptance criteria:**
  - [ ] No second path: every edge change goes through `writeCellMix`; `getConnectedEffectCount` reads 0 once the
        timers fire; the stored Mix is exact on restore (no epsilon).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/audioEngine/bypassCell.test.ts` passes;
        the mutation gate on the hold-off branch; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 9 (for the name only; buildable in parallel).

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** S

- [ ] **Task 11: `src/systems/audioBudgetSystem.ts`, `src/store/audioStore.ts` — the push and `effectsHeldOff`**

  **Description:** `applyLfoTiers` becomes `applyTiers`: its key gains `effectsEnabled`; it calls
  `setEffectsHeldOff(!limits.effectsEnabled)` (globalFx) and `useAudioStore.getState().setEffectsHeldOff(…)` beside
  the three LFO calls; `stopAudioBudget` lifts it (`setEffectsHeldOff(false)` both sides). `audioStore` gains the
  boolean and its setter, the `driftHeldOff` pattern, not persisted.

  **Proof:** RED test — `src/systems/audioBudgetSystem.test.ts`: Effects Load 0.2 at start pushes held-off true once
  (engine then store); a nudge inside the tier pushes nothing; crossing 0.4 up pushes false once; `stopAudioBudget`
  lifts it; `force` re-pushes. `src/store/audioStore.test.ts`: the boolean defaults false and the setter writes it.

  **Acceptance criteria:**
  - [ ] Exactly one engine call per crossing; the store boolean mirrors the limit; Robot Load changes never touch it.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts src/store/audioStore.test.ts` passes; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 9, 10.

  **Files:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`, `src/store/audioStore.ts`, `src/store/audioStore.test.ts`

  **Estimated scope:** S

- [ ] **Task 12: the ten Mix rows, `AudioLoadPanel.tsx`, `hudLines.ts`, `audioDiagnostics.ts`, `src/content/` — the UI and the overlay**

  **Description:** Each of the ten Mix controls (the Colour drawer's three, the six Modulation sub-tabs' Mix/Return
  rows that are cells or branches, Width) disables with a `HeldOffNote` while `effectsHeldOff`, the stored value kept
  on the slider; the Audio Load panel's readout already changes through `describeLimits` (T9); the `?debug` overlay's
  `lfo drift … · filter … · bus …` line gains ` · fx off` while held off (`audioDiagnostics` reads
  `getEffectsHeldOff`). The note's copy is the existing "Held off by Audio Load" entry.

  **Proof:** RED test — `src/components/debug/hudLines.test.ts`: the line carries `fx off` when the flag is set and
  not otherwise; one rendering test per touched panel (`AudioLoadPanel.test.tsx` and the drawers' existing tests):
  with `effectsHeldOff` true the Mix control is disabled and the note rendered, the slider value unchanged.

  **Acceptance criteria:**
  - [ ] All ten rows grey together and un-grey together; no literal string in a component (`content.test.ts`).

  **Verification:**
  - [ ] `npx vitest run src/components` passes; `npm run build:types`, `npm run lint` clean.
  - [ ] Manual: `?debug&load=light` on D1 — the ten rows greyed with the note, the overlay line ending `fx off`,
        `fx in 0/10` once the timers fire; drag Effects Load past 40 % — rows un-grey, `fx in` returns to the world's count.

  **Dependencies:** Task 11.

  **Files:** the ten Mix rows' panels (`AudioRigEffectPanel.tsx` / the Modulation and Colour drawers as they stand),
  `src/components/.../AudioLoadPanel.tsx`, `src/components/debug/hudLines.ts` + test, `src/engine/audioDiagnostics.ts`, `src/content/…`

  **Estimated scope:** M (several panels, one line each, plus the overlay)

- [ ] **Task 13: `docs/todo/scratchy-audio-phones.md` — H1's A/B and crossing**

  **Description:** Spec §1.5 steps 3–4. The branch (T9–T12 in) against the branch's base, same session, three
  interleaved rounds, D1 and D5 at Light, 240 s: kept when the mean drops by at least A1's price less the noise band,
  the peak window does not rise, `max lag` inside the base's spread; one Full run per world inside the base's spread.
  The crossing: the real-time-context recorder recipe (DARK_EFFECT_BYPASS.md §5 step 2) on a lit Phaser and a fed
  Colour room, Effects Load dragged 0.6 → 0.2 and back, three runs each: ≤ ×1.6, no gap. Recorded in the decomposition
  section; the decision table's H1 row updated with kept/dropped.

  **Proof:** A run, recorded. No test file.

  **Acceptance criteria:**
  - [ ] The four numbers (mean delta, peak, `max lag`, Full) and the crossing figure stated with spreads; the verdict
        is Crawford's on them.

  **Verification:**
  - [ ] Hygiene as Phase A2; the record traces to the JSON files.

  **Dependencies:** Task 12.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** S (~30 minutes of runs plus the recorder)

**The Reverb, shorter at Light** (spec §1.3 H5, §1.6 (2); audible → Light only)

- [ ] **Task 19: `src/constants/index.ts`, `src/utils/audioBudget.ts`, `globalFx.ts`, `audioBudgetSystem.ts`, `audioStore.ts`, the Reverb's Decay row — the Reverb decay cap**

  **Description:** `LOAD_REVERB_CAP_BELOW = 0.4` (Effects Load: Light capped, Standard and Full not, H1's placement)
  and `REVERB_DECAY_CAP_S`, the cap in seconds (provisional 1.5; T24 sets it). `EffectsLoadLimits` gains
  `reverbDecayCap: number | null` (the cap below the threshold, `null` above). `globalFx.ts` keeps the stored decay
  (`setGlobalReverb` records it first, as T10's `lastMix` does for a Mix) and pushes `min(stored, cap)` through the
  existing coalesced impulse path (`flushReverbIr`, a `Reverb.generate()`); lifting the cap pushes the stored decay
  back, exact. `applyTiers` (T11) pushes the cap beside the effects flag; `audioStore` gains `reverbCapped`, true only
  while the stored decay exceeds the cap; the Reverb's Decay row shows the `HeldOffNote` with its value kept while
  capped; `describeLimits` names a shorter reverb (the phrase through the content layer).

  **Proof:** RED test — `src/utils/audioBudget.test.ts`: `effectsLoadToLimits(0.2).reverbDecayCap` is the cap,
  `(0.4)`, `(0.6)` and `(1)` null. `src/engine/audioEngine/globalFx.test.ts`: capped with a stored 3 s decay writes
  the cap; a stored decay under the cap writes the stored value; a decay write while capped records it and writes the
  `min`; lifting restores the stored decay exactly; a re-send writes nothing. `src/systems/audioBudgetSystem.test.ts`:
  one push per crossing. The Decay row's rendering test with `reverbCapped` true.

  **Acceptance criteria:**
  - [ ] Light's Reverb never runs past the cap; Standard and Full untouched; the stored decay (session, share link)
        never changes.

  **Verification:**
  - [ ] The touched tests pass; the mutation gate on the `min` and the restore; `npm run build:types`, `npm run lint`
        clean.

  **Dependencies:** Task 13 (stacked on H1).

  **Files:** `src/constants/index.ts`, `src/utils/audioBudget.ts` + test, `src/engine/audioEngine/globalFx.ts` + test,
  `src/systems/audioBudgetSystem.ts` + test, `src/store/audioStore.ts` + test, the Reverb's Decay row, `src/content/…`

  **Estimated scope:** M

- [ ] **Task 24: `docs/todo/scratchy-audio-phones.md` — the Reverb cap's value, A/B and crossing**

  **Description:** First the cap's value: T19's build at 1.0, 1.5 and 2.0 s on D1 (the longer seeded decay) at
  Light, one 120 s run each against T13's commit, with Crawford's ear on the three; Crawford picks, and
  `REVERB_DECAY_CAP_S` is set to it (one commit, the constant only). Then spec §1.5 steps 3–4 against T13's commit:
  D1 and D5 at Light, 240 s, kept on any drop outside the noise band (a cap saves part of A5's price, not all of it;
  D5's seeded decay may already sit under the cap, so its delta may be nil, stated); one Full run per world; the
  crossing (Effects Load dragged 0.6 → 0.2 and back, an impulse swap on a live Reverb) through the recorder recipe,
  three runs, ≤ ×1.6, no gap.

  **Proof:** A run, recorded. No test file.

  **Acceptance criteria:**
  - [ ] The cap's value is Crawford's; the four numbers and the crossing figure stated with spreads.

  **Verification:**
  - [ ] Hygiene as Phase A2; the record traces to the JSON files.

  **Dependencies:** Task 19.

  **Files:** `docs/todo/scratchy-audio-phones.md`, `src/constants/index.ts` (the value)

  **Estimated scope:** S

**Three sounding robots at Light** (spec §1.6 (3); audible → Light only)

- [ ] **Task 25: `src/constants/index.ts`, `src/utils/audioBudget.ts` — `LOAD_AUDIBLE_ROBOTS_MIN` 2 → 1**

  **Description:** The Robot Load floor lowered by one: `maxAudibleRobots = round(lerp(1, 12, load))`, so Light (0.2)
  caps three sounding robots (3.2 → 3), Standard (0.6) stays eight (7.6 → 8), Full twelve, and the slider's bottom
  reads one. With T14 in, the fourth robot's voice is released when it stands by. `describeLimits` reads "Up to 3
  robots" by itself.

  **Proof:** RED test — `src/utils/audioBudget.test.ts`: `robotLoadToLimits(0.2).maxAudibleRobots` 3, `(0.6)` 8,
  `(1)` 12, `(0)` 1; any existing case pinned to four at Light updated and named in the commit.

  **Acceptance criteria:**
  - [ ] Light caps three; Standard and Full unchanged; admission order (`orderByArrival`, `reconcileSounding`)
        unchanged.

  **Verification:**
  - [ ] `npx vitest run src/utils/audioBudget.test.ts src/systems/audioBudgetSystem.test.ts` passes;
        `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 24.

  **Files:** `src/constants/index.ts`, `src/utils/audioBudget.ts`, `src/utils/audioBudget.test.ts`

  **Estimated scope:** XS

- [ ] **Task 26: `docs/todo/scratchy-audio-phones.md` — the sounding cap's A/B**

  **Description:** Spec §1.5 step 3 against T24's commit: D1 and D5 at Light, 240 s, kept on any drop outside the
  noise band (about 0.06 a robot by the decomposition's §6); one Full run per world inside the base's spread. No
  crossing of its own: a robot standing down is H2's release path, measured in T15.

  **Proof:** A run, recorded. No test file.

  **Acceptance criteria:**
  - [ ] The four numbers stated with spreads; the verdict is Crawford's on them.

  **Verification:**
  - [ ] Hygiene as Phase A2; the record traces to the JSON files.

  **Dependencies:** Task 25.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** S

**The stacked sitting**

- [ ] **Task 27: the stacked sitting, prepared**

  **Description:** Three production builds on the LAN, each on its own port: T13's commit (pedals off), T24's (plus
  the shorter Reverb) and T26's (plus three robots), with `main` at its merge-base beside them. A `phone.html` links
  page in each `dist` with D1 and D5 at `?debug&load=light`, and the last build at `?debug&load=full` too; every link
  pre-checked headlessly over the LAN (pin check, powered on, Light, `latency playback`, `fin ok`, `fx in 0/10` on all
  three once the timers fire, the Reverb at the cap on the second and third, three sounding at most on the third). The
  commands, cleanup included, in the session scratchpad's `commands.txt`.

  **Proof:** A run (the headless pre-checks). No test file.

  **Acceptance criteria:**
  - [ ] Every link pre-checked; each build shows its own cuts on the overlay.

  **Verification:**
  - [ ] The pre-check lines pasted into the record's draft.

  **Dependencies:** Task 26.

  **Files:** none in the repo (scratchpad only)

  **Estimated scope:** XS

- [ ] **Task 28: `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md` — the stacked sitting, recorded (Gate C2)**

  **Description:** Crawford's runs on a rested Pixel 8, a fresh tab per run, hands off to 3:00, read at 4:00: `main`
  once per world at Light for the baseline, then the three builds in order on D1 and D5 at Light, stopping at the
  first build that is clean on both worlds; that build once per world at Full by ear. Recorded in T21's table shape.
  The cuts past the first clean build are reverted, one commit per revert, named.

  **Proof:** A run (Crawford's), recorded. No test file.

  **Acceptance criteria:**
  - [ ] Gate C2's verdict stated in Crawford's words, per run; the reverted cuts listed with their desktop numbers.

  **Verification:**
  - [ ] Manual read; `npm run lint` clean.

  **Dependencies:** Task 27.

  **Files:** `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (the record; the runs are Crawford's)

### Gate C2: The first clean build
- [ ] The first stacked build that is clean by ear on D1 and D5 at Light named; the cuts past it reverted and recorded
      with their numbers.
- [ ] If none is clean: the item returns to Crawford with the floor's numbers (spec §1.6); a cheaper robot voice or
      native-node pedals is a spec of its own.

---

### Phase D: Docs

- [ ] **Task 22: `docs/PERFORMANCE.md`, `docs/AUDIO_SYSTEM.md` — document the tools and the shipped behaviour**

  **Description:** PERFORMANCE.md: a "Handler breakdown — `npm run perf:audio-handlers`" subsection under the audio
  series (what it reads, the ~3× caveat, the shares rule, the flags, Q1's answer), the census line under "The long-run
  columns", and the shared open-the-world helper named. AUDIO_SYSTEM.md "Audio Load Budget": the effects tier
  (`LOAD_EFFECTS_MIN`, `effectsEnabled`, `effectsHeldOff`, what greys, the overlay's `fx off`) and the standing-by
  release (which robots carry a voice at each tier, the re-reserve on admission); "The bypass cells": a dark cell's
  LFOs stopped at the crossing; "LFO Modulation": the drift secondaries stopped with the drift tier. Only the cuts that
  shipped; every named identifier spot-checked against the final source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every documented name exists in the shipped source; dropped cuts are not described as shipped.

  **Verification:**
  - [ ] Manual review against source; `npm run lint` clean.

  **Dependencies:** Gate C, or Gate C2 after a miss.

  **Files:** `docs/PERFORMANCE.md`, `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** S (docs only)

- [ ] **Task 23: `docs/todo/backlog.md`, `docs/todo/plan.md`, `docs/specs/LIGHT_TIER_STANDING_COST.md` — the Built line**

  **Description:** Backlog 27 gains its **Built** line (the cuts kept, with their desktop numbers and the sitting's
  verdict, links to the spec, this plan and the records); plan.md's Stage 1 line is deleted (the stage's heading stays
  until the archive move, todo-archive conventions); the spec gains a short §8 "As built" listing deviations from
  §1.3's shapes. The archive move of 27 happens at merge, as the conventions say.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] The Built line names every kept and dropped cut with its number; plan.md no longer lists 27.

  **Verification:**
  - [ ] Manual read; `npm run lint` clean.

  **Dependencies:** Task 22.

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`, `docs/specs/LIGHT_TIER_STANDING_COST.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every kept cut's acceptance criteria met; every dropped cut reverted and recorded.
- [ ] Docs reflect the shipped behaviour, every name spot-checked.
- [ ] Gate C or Gate C2 passed, or the item is back with Crawford with the floor's numbers (stated here, never silent).
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The `webaudio.audionode` trace category is gone or renamed on current Chrome, so the breakdown gives no per-handler rows | Medium | T1's `note` and T2's first run make it explicit; T4 records the fallback; the ablations (T6, T7) and the census (T3) carry the decomposition on their own (Architecture Decisions, Q1). |
| The ablation deltas do not sum: pieces interact (a dark effect's LFO is part of A1's and A3's price) and the band is wide at 120 s | Medium | The noise band is measured first on stock-vs-stock; deltas are read as an ordering, not arithmetic (the 2026-09-20 rule); T7 reports the explained share honestly and Gate A decides whether to chase the remainder. |
| The ablation series is long and spans sessions; a stock build drifts between sessions | Medium | Every record names the stock commit and hash; a new session re-runs one stock pair before continuing; variants are never committed, so nothing can leak into the branch. |
| H1's hold-off leaves a room's `in` fed while every branch is dark, so a fed room still costs a dark effect each | Low | By design (spec §1.3 H1); A1 prices exactly this state; `setRoomFed` is untouched so the crossing protocol is the proven one. |
| H1 restores a Mix the user changed while held off to the wrong value | Medium | `lastMix` is written by every setter whether held off or not, and T10's test pins "write while held off → recorded, restored exactly". |
| H2's release mid-note strands the voice counter or clicks the tail | High | T14's test pins the counter after a release mid-note; the release waits for the tail (or defers to the measure tick, pinned either way); T15's recorder run measures the admission crossing; Gate B listens for it. |
| H2 at Full releases nothing but the diff path still runs on every set change | Low | `setSoundingRobots(null)` short-circuits the diff (pinned); the set changes only on the signature, not on every tick. |
| H3a: a restarted LFO at phase 0 is audible on a lit pedal | Low | The start lands before the connect while the wet gain is 0, so the phase reset happens in silence; T18's crossing run measures it (≤ ×1.6). |
| H3a: Tone's `Vibrato` starts its own LFO in its constructor and may not expose it the way the others do | Low | T16 feature-detects per effect and leaves an effect with no reachable LFO alone (empty `lfos`), recorded in the task. |
| H2's admission re-primes the robot's LFO links, which A2 did not price, so the cut saves less than A2 measured | Low | T15's A/B is of the real cut; kept on A2's price less noise, or Crawford's call on a smaller saving. |
| The Reverb cap's crossing swaps the impulse on a live convolver and clicks | Medium | T24's recorder run on the crossing; the swap is Tone's own `generate()` path the Decay slider already uses. |
| The stacked sitting runs long on one phone and heat skews the later builds | Medium | A rested phone; `main`'s baseline first; a build that reads worse than the one before it is repeated after a rest. |
| A kept cut passes the desktop A/B and the phone still clicks (the desktop is a proxy) | High | Gate C is the only pass; §1.6's deeper-cut order is pre-written so a miss is a next task, not a new design; the floor is reported, never papered over. |
| The 10-minute tool limit on an agent's shell truncates a run | Low | ≤ 2 four-minute or 4 two-minute runs per call (PERFORMANCE.md hygiene); the phone and any 15-minute run are Crawford's terminal. |

## Open Questions

1. **Trace category live?** (spec §7 Q1) **Resolved by construction** (Architecture Decisions): T2's first run
   answers it; the fallback is built into T1's note and T4's record.
2. **H1's threshold.** (spec §7 Q2) **Resolved**: `LOAD_EFFECTS_MIN = 0.4`, Light off, Standard on, built only on a phone miss (Gate A); raising it for Standard is out of this work.
3. **H2's admission: build on entry or a warm pool?** (spec §7 Q3) **Resolved**: build on entry (T14); a warm pool is
   not built.
4. **Reopen backlog 28 (EQ3/LPF/HPF at neutral)?** (spec §7 Q4) **Resolved at Gate A (2026-10-28): not reopened.** The EQ levels are seeded, so the worlds are not at neutral; backlog 28's decision stands.
5. **A Reverb decay cap at Light?** (spec §7 Q5) **Resolved at Gate A:** a decay cap at Light, the second of Phase C2's three cuts (T19, T24); its value set by T24's sweep and Crawford's ear.
6. **Numbering.** (spec §7 Q6) **Resolved**: stays backlog 27 (T0, T23); no roadmap phase.
7. **The 70 % criterion.** (spec §7 Q7) **Resolved** as a reporting rule: T7 states the explained share; Gate A
   decides what to do under 70 %.
8. **Ablation runs at 120 s instead of the spec's 240 s** (Architecture Decisions). **Resolved**: Crawford's yes, 2026-10-27; T6, T7 and T8a ran at 120 s, and every Phase B
   A/B runs at 240 s.
9. **H2's mid-note release: wait for the tail or defer to the measure tick?** **Open** until T14 finds which path
   reuses `scheduleVoiceRelease` cleanly; pinned in T14's test either way, named in its commit.
