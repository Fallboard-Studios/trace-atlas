# Implementation Plan: Audio Load Budget

Source spec: [docs/specs/AUDIO_LOAD_BUDGET.md](../specs/AUDIO_LOAD_BUDGET.md) (implemented 2026-09-20/21; see "As Shipped" at the end — task 25, the phone run, was Crawford's and is recorded 2026-09-21). Covers [Roadmap 17.2.6](../todo/roadmap.md#1726-performance-audio-load-budget). Background and measurements: [docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md).

## Overview

One user-adjustable **Audio Load** dial (Light / Standard / Full presets plus a fine slider, in Audio Rig → Transport & Composition) lowers audio cost four ways: it caps **audible robots** and **polyphony**, applies **LFO tiers** (drift off ≤ Standard; filter-frequency/Q LFOs off on Light; cheap EQ-gain LFOs kept; robot LFOs capped by count), and picks the **latency hint** at page load (Light → `playback`). Over-budget robots "stand by" first-come-first-served (solo always sounds). **Full is exactly today's behavior**, so the whole feature is opt-down. Default is automatic — Light on phone-like devices — with `?load=` to pin it and the chosen preset mirrored into the URL.

**Ordering principles**

1. **Measure before building.** The link between "robots sounding" and the load waves is an inference from a simulation and one time series (spec §7 risks). Phase 1 makes it measurable, records a baseline, and tests the correlation *before* any product change, and Task 11 re-tests the lever with the caps alone *before* the UI and LFO work is built on it.
2. **Full is a no-op, always.** Every task leaves behavior at `audioLoad = 1` identical to today, and the suite green. The engine defaults (`soundingRobots === null`, `polyphonyCap = MAX_POLYPHONY`) mean nothing changes until the budget system runs.
3. **Vertical slices, riskiest first.** The audible-robot + polyphony cap works end to end (Phase 3, no UI) before the control is built (Phase 4); the LFO tiers (Phase 5, the newest `lfoEngine` behavior) come after the slice they extend is proven.
4. **Pure core first, TDD.** Every decision is a pure function in `src/utils/audioBudget.ts` with its own tests; the system, engine, and UI are thin shells (the `audioHealth.ts` / `audioDiagnostics.ts` split).

## Architecture Decisions

- **Gating at the note trigger only; no voice teardown** (spec §1.6). No build spike, no click when a robot's state changes. Lazy voice chains stay a deferred Phase B.
- **The engine takes pushes, never imports the store** (spec §2). `AudioEngine.setSoundingRobots()` / `setPolyphonyCap()` are called by `audioBudgetSystem`; this preserves the existing engine↔`audioStore` load-order constraint (`AudioEngine.ts` imports the store dynamically for that reason).
- **Subscribe to a signature, write only on change** (spec §3, §4.4). `updateRobot` rewrites the locale on every battery tick and swell write; the system watches an `id:audioMode:docking` signature string and writes `soundingRobotIds` only when the set changes — the repo's re-render-storm lesson (backlog items 21–27) applied up front.
- **A tier only suspends; it never edits a value** (spec §1.4). Held-off LFOs keep their stored settings and are simply not connected — the "off via the parameter" pattern the Audio Rig and Layer toggles already follow. "Held off" means *requested (rate > 0) but not connected because of the dial*.
- **Cut LFOs by cost** (spec §1.4, decision I): drift, then filter-frequency/Q, keep EQ-gain; robot LFOs capped by count. Robot caps come from **measurement** (Task 4, decision K), not the spec's 4 / 12 placeholders.
- **Latency is a load-time decision** (spec §1.5): a context's `latencyHint` is fixed at creation. `audioContextSetup.ts` reads the *initial* preset through a pure resolver; `?latency=` still wins. Standard stays `interactive` (decision J, resolved 2026-09-20).
- **Stacked commits on `bugs/scratchy-audio-phones`, one per task, no push** until Crawford says so. Tone `lookAhead` (17.2.4) stays untouched.
- **Throwaway measurement variants are never committed** (the session's recipe: patch source → `vite build --outDir <scratch>` → `git checkout --` the patched files; run from a clean tree). Only the recipe and the numbers land in docs.

## Definition of Done (every task)

The skill's referenced `definition-of-done.md` is not present on this machine, so this repo's own bar applies to every task, in addition to that task's acceptance criteria:

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint. Backlog #29's flaky swell tests (`audioSwells`, `worldTransition`'s swell test, `CompanyCrudControls`, `factoryPlacementSystem`) may fail intermittently — re-run in isolation before blaming the change.
- [ ] `CLAUDE.md` PR checklist: no synths in components; no timelines/refs in state; scheduling stays beat-based with `MIN_LEAD`; state stays JSON-serialisable; **no timer-driven musical timing**.
- [ ] Behavior at `audioLoad = 1` is unchanged (from Task 8 on, covered by a test).
- [ ] New gates are mutation-checked (break the code, confirm a test fails), as `audioHealth`/`audioContextSetup` were.
- [ ] One commit per task, tests with their code, message ends with the session's attribution line.

## Dependency Graph

```
Phase 1 — Measure first
Task 1 (overlay: audible-robot count) ──┐
Task 2 (perf:audio script) ─────────────┼──→ Task 3 (PRE-change baseline + correlation)
Task 2 ─────────────────────────────────┴──→ Task 4 (robot-LFO cost per target type → cap values)
                       ── Checkpoint A: is the lever real? ──
Phase 2 — Pure core
Task 5 (limits/dial/params/detect) ──→ Task 6 (admission + lfoAllowed)      [Task 5 needs Task 4's cap values]
                       ── Checkpoint B ──
Phase 3 — Caps end to end (no UI)
Task 5 ──→ Task 7 (audioStore: audioLoad, soundingRobotIds)
Task 8 (engine gate + polyphony cap)                                        [independent of 5–7]
Tasks 6, 7, 8 ──→ Task 9 (audioBudgetSystem: sounding set + polyphony)
Task 9 ──→ Task 10 (overlay: caps line) ──→ Task 11 (caps-only measurement: DECISION GATE)
                       ── Checkpoint C ──
Phase 4 — Controls and status
Task 7 ──→ Task 12 (audibility-state helper + "Standing by" label) ──→ Task 13 (cards show it)   [needs Task 9 for real data]
Task 5 ──→ Task 14 (control schemas + readout) ──→ Task 15 (drawer wiring) ──→ Task 16 (URL mirror)
                       ── Checkpoint D: end-to-end flow ──
Phase 5 — LFO tiers
Tasks 4, 6 ──→ Task 17 (lfoEngine policy + reconcile: global kinds) ──→ Task 18 (drift tier)
                                                                   └──→ Task 19 (robot-LFO cap)
Tasks 9, 17, 18, 19 ──→ Task 20 (budget system drives LFO tiers; held-off state)
Task 20 ──→ Task 21 (greyed-out: Audio Rig) ;  Task 20 ──→ Task 22 (greyed-out: Robot Options)
                       ── Checkpoint E ──
Phase 6 — Latency
Task 5 ──→ Task 23 (latency hint from the boot-time preset)
Phase 7 — Prove it
Tasks 11, 20, 23 ──→ Task 24 (full measurement gates) ──→ Task 25 (phone protocol; Crawford's run) ──→ Task 26 (docs close-out)
                       ── Checkpoint F: complete ──
```

Independent chains that could run in parallel (each is small, so sequential numeric order is still recommended): Task 1 ∥ Task 2; Task 8 ∥ Tasks 5–7; Tasks 14–16 ∥ Tasks 12–13; Tasks 21 ∥ 22; Task 23 anywhere after Task 5.

## Task List

### Phase 1: Measure first (only diagnostic product code)

- [x] **Task 1: Overlay — audible-robot count**

  **Description:** Add one line to the `?debug` overlay showing how many robots are currently audible (`isRobotAudible` over the active locale's robots) out of the roster, so the load waves can be correlated with robot activity on desktop and read off the phone at the moment clicks start. Read at the existing 500 ms sample (in `audioDiagnostics.readInfo`) — no store subscription.

  **Acceptance criteria:**
  - [ ] The overlay shows `audible n/12` (n from `isRobotAudible(audioMode, anySolo)` over the active locale's robots; total from the roster length).
  - [ ] It changes as robots dock, undock, mute or solo (covered by a unit test over a stubbed store).
  - [ ] No new store subscription and no new render trigger: the value is sampled in `readInfo`, so the overlay's render cadence is unchanged.
  - [ ] With no locale/robots yet the line reads `audible 0/0` (no NaN/undefined).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioDiagnostics.test.ts src/components/debug`
  - [ ] Manual: `npm run dev` (or the preview build), open `?debug`, power on, watch the count move as robots dock/undock over ~2 minutes.

  **Dependencies:** None

  **Files likely touched:** `src/engine/audioDiagnostics.ts`, `src/engine/audioDiagnostics.test.ts`, `src/components/debug/hudLines.ts`, `src/components/debug/hudLines.test.ts`

  **Estimated scope:** Small (4 files)

- [x] **Task 2: `perf:audio` — promote the render-capacity script into the repo**

  **Description:** Turn the session's scratch scripts (`audioload.mjs`, `timeseries.mjs`) into `scripts/perf/audio-load.mjs` with an `npm run perf:audio` entry, following `scripts/perf/profile.mjs`'s conventions (Node built-ins only, CDP over `WebSocket`, `--help`, its own temp profile). It polls `WebAudio.getRealtimeData` and reports render capacity per time bucket, optionally reading the overlay's `audible n/12` (Task 1) so both series line up.

  **Acceptance criteria:**
  - [ ] `npm run perf:audio -- --world charlie:200:-30 --seconds 240 --bucket 15` prints one row per bucket: elapsed, mean and max render capacity, callback interval, and (if the overlay is present) audible robots.
  - [ ] `--worlds a,b,c` runs them sequentially, with `--rot <n>` rotating the start order for interleaved rounds; an entry may carry an extra query string (e.g. `charlie:200:-30?load=light`) so variants can be A/B'd in one session.
  - [ ] Worlds are pinned via `?seed=&x=&y=`; the base URL is `--url` (default `http://localhost:4173/trace-atlas/`).
  - [ ] Exits cleanly: no Chrome process or temp profile left behind (verified with the orphan check below); works when the target is the LAN address (insecure context) as well as `localhost`.
  - [ ] Only Node built-ins — no new dependency; `--help` documents every flag; usage and the measurement-hygiene rules (foreground, one call at a time, check for orphaned Chrome, same-session A/B) are added to `docs/PERFORMANCE.md`.

  **Verification:**
  - [ ] `npx eslint scripts/perf/audio-load.mjs`
  - [ ] Build + `npx vite preview --port 4173`, then one 60-second `perf:audio` run produces plausible numbers (charlie ≈ 0.3–0.5) and the orphan check is empty: `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"` filtered on `trace-atlas-perf`.

  **Dependencies:** Task 1 (for the audible column; the script must degrade gracefully without it)

  **Files likely touched:** `scripts/perf/audio-load.mjs`, `package.json`, `docs/PERFORMANCE.md`

  **Estimated scope:** Small (3 files)

- [x] **Task 3: Record the PRE-change baseline and test the correlation**

  **Description:** No product change. On the untouched build, record what everything after this is measured against, and test the spec's central inference — that render load tracks how many robots are sounding. This is the reference for spec §5.3 criteria 4 and 1 ("Full within ±0.03").

  **Acceptance criteria:**
  - [ ] A dated section in `docs/PERFORMANCE.md`: worlds `charlie:200:-30` and `bravo:-150:90`, **3 runs each, 4-minute series, 15-second buckets**, run in the foreground one call at a time with no orphaned Chrome before/after, rotated start order, code measured named by commit.
  - [ ] Per world: per-bucket mean/max capacity, the **peak-window value** (highest bucket mean — the number Light must beat — see task 11 for the revised gate) and the overall mean, with the run-to-run spread stated.
  - [ ] The **correlation** between audible robots and capacity is computed and stated (a plain Pearson r over the buckets, per world and pooled), with an honest reading.
  - [ ] **Decision line for Crawford:** if the correlation is weak (|r| < ~0.5), stop and report before Phase 2 — the spec's premise would need revisiting (spec §7 risk).

  **Verification:**
  - [ ] The tables in the doc regenerate from a re-run within the stated noise band (one spot re-run).
  - [ ] Orphan check empty; `git status` clean afterwards.

  **Dependencies:** Tasks 1, 2

  **Files likely touched:** `docs/PERFORMANCE.md`

  **Estimated scope:** Small (1 file; ~25 minutes of runs)

- [x] **Task 4: Measure robot-LFO cost per target type (decision K)**

  **Description:** Decision K says the robot-LFO caps come from data, not the 4 / 12 placeholders. Only "51 at once saturates the audio thread" is known. Using throwaway builds (recipe from this session's `robotlfo` variant, connecting N robot LFOs of *one target type* a few seconds after power-on, since robots spawn after `powerController.start()`), measure the cost of each audio-rate robot target type — `volume`, layer `gain`, layer `detune`, layer `pulseWidth`. (`layerN.phase` uses a control-rate `scheduleRepeat` poll and is excluded from the cap — see Task 19.)

  **Acceptance criteria:**
  - [ ] Per target type: Δ render capacity versus same-round stock at N = 4, 12 connected, 3 rounds interleaved on `charlie:200:-30`, differences from same-round stock (not absolute levels), with the noise band.
  - [ ] The callback interval is recorded for each (a doubling from ~10.7 ms means deadline misses).
  - [ ] **Two cap values are chosen and justified** — `ROBOT_LFO_CAP_LIGHT` and `ROBOT_LFO_CAP_STANDARD` — such that the worst realistic mix at each cap keeps capacity < 0.9 with no interval doubling (spec §5.3 criterion 5). They may differ from 4 / 12.
  - [ ] The patch recipe is recorded in `docs/PERFORMANCE.md`; **no throwaway source is committed** (`git status` clean, checked after each build).

  **Verification:**
  - [ ] Orphan check empty; `git status` clean; scratch builds deleted.

  **Dependencies:** Task 2

  **Files likely touched:** `docs/PERFORMANCE.md`, `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** Small (docs only; ~30 minutes of runs)

### Checkpoint A: Measured, and the lever is real
- [ ] Baseline recorded (Task 3); correlation stated; cap values chosen (Task 4)
- [ ] `npm test`, `npm run build:types`, `npm run lint` green
- [ ] **Review with Crawford** — go/no-go on the spec's premise before Phase 2

### Phase 2: Pure core (no behavior change; nothing wired)

- [x] **Task 5: The dial — limits, presets, params, detection**

  **Description:** Create `src/utils/audioBudget.ts` with the pure dial logic and its constants: `loadToLimits(audioLoad)` (counts interpolate linearly, booleans switch at thresholds), the preset table, `latencyForLoad`, `parseLoadParam` / `loadToSearchParam`, `detectDefaultAudioLoad(env)`, and `resolveInitialAudioLoad(env)` (`?load=` beats detection). The module imports only constants (no Tone, no stores) so `audioContextSetup` can use it before Tone loads. Robot-LFO caps use the values chosen in Task 4.

  **Acceptance criteria:**
  - [ ] `loadToLimits(1)` equals today exactly: 12 robots, 16 notes, drift on, filter LFOs on, robot LFOs `Infinity`, `interactive`. `loadToLimits(0.2)` = 4 robots / 8 notes / drift off / filter LFOs off / Light robot cap / `playback`; `loadToLimits(0.6)` = 8 / 12 / drift off / filter LFOs on / Standard robot cap / `interactive` (decision J).
  - [ ] Thresholds are honored on both sides (`LOAD_DRIFT_MIN` 0.8, `LOAD_FILTER_LFOS_MIN` 0.4); out-of-range and non-finite input clamps (NaN → Full).
  - [ ] `parseLoadParam` accepts `light|standard|full` and `0–100`, case-insensitively; invalid → `null`. `loadToSearchParam` round-trips (a preset value serializes to its name, other values to a percent).
  - [ ] `detectDefaultAudioLoad({ coarsePointer })` → Light when coarse, Full otherwise (decision D); `resolveInitialAudioLoad` prefers a valid `?load=` over detection.

  **Verification:**
  - [ ] `npx vitest run src/utils/audioBudget.test.ts` (new); mutation-check the Full-equals-today assertion and one threshold.
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Task 4 (cap values)

  **Files likely touched:** `src/constants/index.ts`, `src/utils/audioBudget.ts`, `src/utils/audioBudget.test.ts`

  **Estimated scope:** Small (3 files)

- [x] **Task 6: Admission and the LFO predicate — pure**

  **Description:** Add `reconcileSounding(previous, eligible, soloIds, maxAudibleRobots)` and `lfoAllowed(target, scope, limits, connectedRobotLfos)` to `audioBudget.ts`. `reconcileSounding` is first-come-first-served with solo priority (spec §1.3): incumbents keep slots, newly eligible robots are admitted in order while there is room, a freed slot goes to the earliest waiter, a lowered cap evicts last-in-first-out, and a solo robot is admitted immediately (evicting the newest non-solo when full). `lfoAllowed` classifies a target (global filter frequency/Q vs EQ gain vs robot) against the limits.

  **Acceptance criteria:**
  - [ ] Never exceeds the cap — asserted property-style over many random eligible/solo sequences.
  - [ ] Incumbents keep their slot; a freed slot goes to the earliest waiter (not roster order); a lowered cap evicts newest first; robots that became ineligible are dropped.
  - [ ] Solo is admitted immediately and evicts the newest non-solo robot when full; more solos than the cap are capped first-come; a later arrival never evicts a solo.
  - [ ] Returns the **same array reference** when nothing changed (so the system can skip the store write); handles empty inputs.
  - [ ] `lfoAllowed`: EQ-gain global targets always allowed; `lpf/hpf.frequency|Q` allowed only when `filterLfosEnabled`; robot targets allowed only below `maxRobotLfos` (a count passed in; `Infinity` at Full); the `layerN.phase` target is always allowed (control-rate — Task 19).

  **Verification:**
  - [ ] `npx vitest run src/utils/audioBudget.test.ts`; mutation-check the LIFO and solo-eviction rules.
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Task 5

  **Files likely touched:** `src/utils/audioBudget.ts`, `src/utils/audioBudget.test.ts`

  **Estimated scope:** Small (2 files)

### Checkpoint B: Pure core complete
- [ ] All pure logic tested; nothing wired; behavior unchanged
- [ ] `npm test`, `npm run build:types`, `npm run lint` green

### Phase 3: Caps end to end (no UI)

- [x] **Task 7: `audioStore` — `audioLoad` and `soundingRobotIds`**

  **Description:** Add the two serialisable fields to `audioStore.ts`: `audioLoad` (0–1, initialised through `resolveInitialAudioLoad` reading `window.location` and `matchMedia('(pointer: coarse)')` at module load, browser-only, same pattern as `seedUtils`) with `setAudioLoad` (clamps), and `soundingRobotIds: string[]` (derived; written only by the budget system). No engine effect yet.

  **Acceptance criteria:**
  - [ ] In jsdom with no params `audioLoad` is `1`; loading with `?load=light` gives `0.2`; `?load=45` gives `0.45`; an invalid value falls back to detection.
  - [ ] `setAudioLoad` clamps to [0, 1] and is the only writer of `audioLoad`.
  - [ ] `soundingRobotIds` defaults to `[]`; state remains JSON-serialisable (`JSON.stringify(getState())` does not throw).
  - [ ] Existing `audioStore` tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/stores/audioStore.test.ts` (boot-param cases use `vi.resetModules()` + `history.replaceState`, the pattern in `seedUtils.test.ts`)
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Task 5

  **Files likely touched:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** Small (2 files)

- [x] **Task 8: Engine — sounding-set gate and dynamic polyphony cap**

  **Description:** In `AudioEngine.ts` add module state `soundingRobots: ReadonlySet<string> | null` (default `null`) and `polyphonyCap` (default `MAX_POLYPHONY`), plus `setSoundingRobots(ids | null)` and `setPolyphonyCap(n)`. In `triggerWithCap`, after the existing `isRobotAudible` check and before the polyphony test, return `false` for a robot outside a non-null sounding set (so a standing-by robot never consumes a slot), and compare `activeVoices` against `polyphonyCap`. `getPolyphonyStats().maxVoices` reports the live cap. The cap applies to new triggers only; nothing forcibly releases counts.

  **Acceptance criteria:**
  - [ ] **Default behavior is byte-for-byte today's**: with `soundingRobots === null` and the default cap, every existing `AudioEngine` test passes unmodified.
  - [ ] A robot not in the set never reaches `triggerAttackRelease` and does not increment `activeVoices`; a robot in it plays.
  - [ ] Lowering `polyphonyCap` below the current `activeVoices` blocks new notes without stranding or forcibly decrementing the counter; raising it restores normal behavior.
  - [ ] `getPolyphonyStats()` reports the live cap; `killAll()` still resets `activeVoices` and leaves the gate/cap untouched.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts`; mutation-check the gate (remove it, a test must fail).
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** None (engine defaults keep it inert)

  **Files likely touched:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** Small (2 files)

- [x] **Task 9: `audioBudgetSystem` — the sounding set and polyphony, live**

  **Description:** New `src/systems/audioBudgetSystem.ts`: `startAudioBudget()` / `stopAudioBudget()` (module-singleton pair, idempotent, mirroring `startRobotLifecycle`). It subscribes to `useLocaleStore` through an `id:audioMode:docking` **signature** of the active locale's robots and to `useAudioStore.audioLoad`. On change it computes eligibility (`isRobotAudible`), calls `reconcileSounding`, and — only if the result differs — pushes it to `AudioEngine.setSoundingRobots`, writes `soundingRobotIds`, and pushes `loadToLimits(...).maxPolyphony` via `setPolyphonyCap`. Started once from `main.tsx` before first power-on; not torn down by a power cycle.

  **Acceptance criteria:**
  - [ ] With `audioLoad = 0.2` and 6 eligible robots, exactly 4 are in `soundingRobotIds` and the engine's set; the other 2 wait in arrival order.
  - [ ] A robot going `Docked` (`audioMode: 'mute'`) frees its slot for the earliest waiter; an explicit unmute when full does **not** jump the queue (decision B); a soloed robot takes a slot immediately (decision A).
  - [ ] Lowering `audioLoad` evicts newest-first; raising it admits waiters; the polyphony cap follows the dial.
  - [ ] **No storm:** over a simulated 200-measure lifecycle run, the store write count equals the number of *real* set changes (not the number of `updateRobot` calls); `stopAudioBudget()` unsubscribes everything; calling start twice is harmless; a power cycle (`AudioEngine.killAll()`) does not clear the set.
  - [ ] At `audioLoad = 1` every eligible robot sounds and behavior is unchanged.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts` (real stores; the lifecycle run reuses `tickRobotLifecycle`)
  - [ ] `npm run build:types`, `npm run lint`, then `npm test`

  **Dependencies:** Tasks 6, 7, 8

  **Files likely touched:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`, `src/main.tsx`

  **Estimated scope:** Small (3 files)

- [x] **Task 10: Overlay — the caps line**

  **Description:** Show the budget in `?debug`: `sounding n/cap`, `poly used/cap`, `load <n>%`, and how many robots are standing by. Read from the store/engine at the existing 500 ms sample.

  **Acceptance criteria:**
  - [ ] The line reads e.g. `load 20% · sounding 4/4 · standing by 2 · poly 3/8`, formatted by a pure function (dash for unknown values, never `NaN`).
  - [ ] It reflects a live change of `audioLoad` within one sample.
  - [ ] At Full it reads `sounding n/12 · poly n/16`, matching today's `voices n/16`.

  **Verification:**
  - [ ] `npx vitest run src/components/debug src/engine/audioDiagnostics.test.ts`
  - [ ] Manual: `?debug&load=light`, power on, confirm the count never exceeds 4 and standing-by robots appear as robots wake.

  **Dependencies:** Task 9

  **Files likely touched:** `src/engine/audioDiagnostics.ts`, `src/engine/audioDiagnostics.test.ts`, `src/components/debug/hudLines.ts`, `src/components/debug/hudLines.test.ts`

  **Estimated scope:** Small (4 files)

- [x] **Task 11: Caps-only measurement — the decision gate**

  **Description:** Before building UI and LFO tiers on top of this, measure whether the caps alone move the needle. `charlie` has no global LFOs at stock, so its Light/Standard/Full difference here *is* the robot + polyphony effect. Record the results and report to Crawford.

  **Acceptance criteria:**
  - [ ] `charlie:200:-30` with `?load=light`, `?load=standard`, `?load=full` (the last equals Task 3's baseline within ±0.03), 3 interleaved rounds, 4-minute series, foreground, no orphaned Chrome, recorded in `docs/PERFORMANCE.md` next to the baseline.
  - [x] ~~Peak-window reduction versus Full: Light ≥ 25%, Standard ≥ 10%~~ — **measured 2026-09-21: Light 18.2%, Standard −1.2% (both missed); stopped and reported (PERFORMANCE.md "Caps-only measurement").** Crawford's call (option 2, spec decision M): anchors stay 4 / 8; the gate becomes **Light ≥ 15% on `charlie`** (met: 18.2%, range 13.4–22.2%) with **no `charlie` gate for Standard** (its 8-robot cap is inert there; Standard is judged on `bravo` in task 24).
  - [x] If a threshold is missed, stop and report — done; work resumed on Crawford's decision.

  **Verification:**
  - [ ] Orphan check empty; `git status` clean.

  **Dependencies:** Tasks 3, 9, 10

  **Files likely touched:** `docs/PERFORMANCE.md`

  **Estimated scope:** Small (docs only; ~20 minutes of runs)

### Checkpoint C: Caps proven end to end
- [ ] `?load=` caps robots and polyphony on desktop; overlay shows it; Full unchanged
- [ ] Task 11 gate met, or Crawford has decided how to proceed
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` green
- [ ] **Review with Crawford**

### Phase 4: Controls and status

- [x] **Task 12: Audibility state — "Standing by"**

  **Description:** Today the cards decide "Emitting" versus "Disabled" from `isRobotAudible` alone (`AUDIBILITY_LABELS` has two states). Add a pure `getAudibilityState(audioMode, anySolo, isSounding)` returning `'emitting' | 'limited' | 'disabled'` beside `isRobotAudible`, and a third `AUDIBILITY_LABELS.limited` ("Standing by", lore label first-pass invented, confirmed in the manual check) plus its status colour mapping.

  **Acceptance criteria:**
  - [ ] Muted → `disabled`; excluded by solo → `disabled`; eligible and in the sounding set → `emitting`; eligible but not in the set → `limited`.
  - [ ] `isRobotAudible` is unchanged and its existing tests pass; `AUDIBILITY_LABELS`' type widens to three keys without breaking existing consumers.
  - [ ] When the sounding set is empty because the system has not run yet (store default), robots read as `emitting`, not `limited` (Full-is-a-no-op).

  **Verification:**
  - [ ] `npx vitest run src/utils/robotAudibility.test.ts src/data/robotSelectionConfig.test.ts`
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Task 7

  **Files likely touched:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`, `src/data/robotSelectionConfig.ts`, `src/data/robotSelectionConfig.test.ts`

  **Estimated scope:** Small (4 files)

- [x] **Task 13: Cards show "Standing by"**

  **Description:** `RobotSelectionCard` and `RobotDisplaySection` use the new state. Each reads it through a **boolean per-robot selector** (`soundingRobotIds.includes(id)`), never the whole array, to avoid the re-render storms this repo has hit before.

  **Acceptance criteria:**
  - [ ] An eligible robot outside the sounding set shows "Standing by"; an audible one shows "Emitting"; a muted one still shows "Disabled".
  - [ ] A robot's card does **not** re-render when an *unrelated* robot enters or leaves the set (render-count test in the existing pattern).
  - [ ] At Full (or before the system runs) the cards are unchanged from today.

  **Verification:**
  - [ ] `npx vitest run src/components/selection/RobotSelectionCard.test.tsx src/components/robot/RobotDisplaySection.test.tsx`
  - [ ] Manual: with `?load=light`, watch Probes list and a robot's detail as robots wake — "Standing by" appears on the later ones and clears when a slot frees.

  **Dependencies:** Tasks 9, 12

  **Files likely touched:** `src/components/selection/RobotSelectionCard.tsx`, `src/components/selection/RobotSelectionCard.test.tsx`, `src/components/robot/RobotDisplaySection.tsx`, `src/components/robot/RobotDisplaySection.test.tsx`

  **Estimated scope:** Small (4 files)

- [x] **Task 14: Control schemas and the readout**

  **Description:** In `audioRigConfig.ts`, beside `BPM_SCHEMA`/`DECAY_MODE_SCHEMA`, add `AUDIO_LOAD_PRESET_SCHEMA` (radio: Light / Standard / Full), `AUDIO_LOAD_SCHEMA` (`sliderLinear` 0–100%) and `AUDIO_LOAD_PANEL_SCHEMA` (`directionalPanel`, first-pass lore copy). Add a pure `describeLimits(limits)` in `audioBudget.ts` producing the readout string ("Up to 4 robots · 8 notes · no drift or filter LFOs · latency: Playback (applies on next load)").

  **Acceptance criteria:**
  - [ ] The three schemas validate against the existing `ControlSchema` types and follow the file's pattern (bare Rig-wide meta-settings that do not join `AUDIO_RIG_CONFIG`'s array).
  - [ ] `describeLimits` is correct at Light, Standard and Full, mentions the load-time latency caveat only when the hint differs from `interactive`, and never prints `Infinity`/`NaN`.
  - [ ] Existing `audioRigConfig` tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/utils/audioBudget.test.ts`
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Task 5

  **Files likely touched:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`, `src/utils/audioBudget.ts`, `src/utils/audioBudget.test.ts`

  **Estimated scope:** Small (4 files)

- [x] **Task 15: The Audio Load panel in Transport & Composition**

  **Description:** Wire the schemas into `AudioRigDrawer.tsx` as a panel next to Tempo (decision F). The radio and slider are two views of one stored number: choosing a preset sets the slider; dragging the slider off a preset leaves the radio with no option selected. The readout line shows `describeLimits`. No engine calls here — the store write is enough, the budget system reacts.

  **Acceptance criteria:**
  - [ ] The panel renders inside Transport & Composition, in the same layout mode as Speed & Automation (responsive rows); nothing is added to `SleeveContainer`.
  - [ ] Selecting Light/Standard/Full sets `audioLoad` to the preset value and the slider follows; dragging the slider updates `audioLoad` and clears the radio selection unless it lands on a preset.
  - [ ] The readout updates live; keyboard and radio semantics come from the existing primitives (no custom handlers).
  - [ ] The drawer's existing render-count/cascade tests pass unmodified (a change to `audioLoad` re-renders only this panel).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` (open the Transport & Composition section first — accordions lazy-mount, see `src/testUtils/openAccordions.ts`)
  - [ ] Manual: change presets in the browser; overlay (`?debug`) shows the caps move; check phone width for layout.

  **Dependencies:** Tasks 9, 14

  **Files likely touched:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx` (+ a CSS tweak if the panel needs spacing)

  **Estimated scope:** Small–Medium (2–3 files)

- [x] **Task 16: Mirror the preset into the URL (decision H)**

  **Description:** When `audioLoad` changes, keep the address bar in sync with `history.replaceState`, preserving every other param, so a reload keeps the choice and links can later be shared. No storage is used. Lives beside the budget system as a store subscriber; a no-op outside a browser.

  **Acceptance criteria:**
  - [ ] Changing the dial sets `?load=` to the preset name (or a percent for a custom value), leaving `seed`, `x`, `y`, `debug`, `latency` intact and not adding history entries.
  - [ ] Setting the dial back to Full removes `?load=` only if it was absent at boot (otherwise keeps it explicit) — behavior decided and asserted in a test.
  - [ ] On reload, `resolveInitialAudioLoad` reads the mirrored value and the dial is where it was left.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts`
  - [ ] Manual: pick Light, reload the page, confirm Light is still selected and the readout matches.

  **Dependencies:** Tasks 7, 15

  **Files likely touched:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`

  **Estimated scope:** Small (2 files)

### Checkpoint D: The user-facing flow works
- [ ] Change the preset → caps change, cards show "Standing by", overlay agrees, the URL updates, a reload keeps it
- [ ] Full is unchanged (spot-check a normal session by ear)
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` green
- [ ] **Review with Crawford** (lore copy, layout on a phone)

### Phase 5: LFO tiers

- [x] **Task 17: `lfoEngine` policy and reconcile (global kinds)**

  **Description:** New behavior for `lfoEngine.ts`: a policy predicate supplied by the budget system (`lfoEngine.setLfoPolicy(fn)`, `null` = allow everything, the default). `connectLfoTarget` returns `false` for a disallowed target and records it as **held off**; `lfoEngine.reconcileLfos()` connects newly allowed LFOs that have `rate > 0` (and starts them) and disconnects newly disallowed ones. Stored settings (`settingsByKey`, `activeLfos`) are never modified. This task covers the global filter-frequency/Q versus EQ-gain split; drift and robots follow.

  **Acceptance criteria:**
  - [ ] With no policy (default) nothing changes: existing `lfoEngine` tests pass unmodified.
  - [ ] With `filterLfosEnabled = false`, `lpf/hpf.frequency|Q` refuse to connect and read as held off while `eq3.*` connect normally; raising it and calling `reconcileLfos()` connects the filter LFOs that have `rate > 0` and starts them.
  - [ ] **Round trip preserves values:** tier down then up leaves every stored rate/depth/shape identical and re-establishes the same connections.
  - [ ] An LFO with `rate = 0` is never "held off" (it was never requested) and is never connected by a reconcile.
  - [ ] `reconcileLfos()` is idempotent; starting respects the existing "context must be running" gate.

  **Verification:**
  - [ ] `npx vitest run src/engine/lfoEngine.test.ts`; mutation-check the policy check in `connectLfoTarget`.
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Tasks 4, 6

  **Files likely touched:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** Small–Medium (2 files)

- [x] **Task 18: The drift tier ("stacked" LFOs)**

  **Description:** Drift links are attached inside `connectLfoTarget` (`attachDrift`) and torn down in `disconnectLfoTarget` (`detachDrift`). Add a drift-suppressed flag in `lfoDrift.ts`: while set, `attachDrift` is a no-op; setting it detaches every existing link; clearing it re-attaches drift for every currently connected primary (`lfoEngine` supplies the list). The seeded/edited drift *amounts* (`globalAudio.lfoDrift`) are never touched.

  **Acceptance criteria:**
  - [ ] Below the drift threshold no drift link exists for any connected LFO (global or robot) and no secondary-LFO Gain pair is constructed for a new connection.
  - [ ] Raising the dial re-attaches drift for the LFOs that are connected, with their current amounts (`refreshRateDriftGain` / `refreshDepthDriftGain` run), and the drift pools are still never disposed.
  - [ ] `globalAudio.lfoDrift` and every LFO's own settings are unchanged by a down/up round trip.
  - [ ] Default (not suppressed) behavior is unchanged: existing drift tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/engine/lfoDrift.test.ts src/engine/lfoEngine.test.ts` (`lfoDrift.test.ts` is new — no such file exists today)
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Task 17

  **Files likely touched:** `src/engine/lfoDrift.ts`, `src/engine/lfoEngine.ts`, `src/engine/lfoDrift.test.ts` (new)

  **Estimated scope:** Small (3 files)

- [x] **Task 19: The robot-LFO cap**

  **Description:** Cap the number of audio-rate robot LFOs that are connected at once at `maxRobotLfos` (values from Task 4). Count `connectedSignals` entries with a `robotId:` key; **`layerN.phase` LFOs are excluded** (they run on a control-rate `scheduleRepeat` poll, `phaseFallbacks`, not an audio-rate connection). A connection over the cap is refused and held off; when the cap falls, the most recently connected robot LFOs are dropped first (last-in-first-out, matching robot admission); when it rises, held-off ones with `rate > 0` reconnect in request order.

  **Acceptance criteria:**
  - [ ] The (cap+1)th audio-rate robot LFO refuses to connect and reads as held off; its stored settings are intact.
  - [ ] Lowering the cap disconnects newest-first down to the cap; raising it reconnects held-off LFOs oldest-request-first.
  - [ ] Phase LFOs are never counted and never refused for the cap.
  - [ ] Global LFOs are unaffected by the robot cap; at Full (`Infinity`) nothing is refused.

  **Verification:**
  - [ ] `npx vitest run src/engine/lfoEngine.test.ts`; mutation-check the cap comparison.
  - [ ] `npm run build:types`, `npm run lint`

  **Dependencies:** Task 17

  **Files likely touched:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** Small (2 files)

- [x] **Task 20: The budget system drives the LFO tiers**

  **Description:** Extend `audioBudgetSystem` so a change of `audioLoad` also (a) installs the LFO policy from `loadToLimits` and calls `lfoEngine.reconcileLfos()`, (b) sets/clears drift suppression, and (c) writes the held-off state to `audioStore` — `heldOffLfoKeys: string[]` (instance keys, e.g. `lpf.Q`, `robot-3:layer0.detune`) and `driftHeldOff: boolean` — **only when they change**. The engine reports held-off keys through a small read function.

  **Acceptance criteria:**
  - [ ] Moving the dial across each threshold connects/disconnects exactly the expected LFO kinds; at Full nothing is held off and `driftHeldOff` is `false`.
  - [ ] `heldOffLfoKeys` lists only LFOs that are requested (`rate > 0`) but not connected, is written only on change, and stays JSON-serialisable.
  - [ ] Global LFOs connected at power-on (`AudioEngine.start`) respect the policy already in force at boot (e.g. `?load=light` from the first note).
  - [ ] A robot LFO enabled by the user after the cap is reached appears in `heldOffLfoKeys` immediately.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts src/stores/audioStore.test.ts`
  - [ ] Manual: `?load=light` on `bravo` (5 global LFOs): confirm via the overlay's LFO count that the filter LFOs are off and the EQ ones remain.

  **Dependencies:** Tasks 9, 17, 18, 19

  **Files likely touched:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`, `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`, `src/engine/lfoEngine.ts`

  **Estimated scope:** Medium (5 files)

- [x] **Task 21: Greyed-out LFO controls — Audio Rig**

  **Description:** In the Audio Rig, a held-off global LFO frame is **greyed out** (decision L): controls disabled via the existing `Lfo` `disabled` prop, stored values still displayed, with a short "Held off by Audio Load" label. The Drift sliders (per-group Rate/Depth Drift beneath the EQ/LPF/HPF blocks) grey out the same way while drift is held off. Each frame reads its state through a boolean selector on `heldOffLfoKeys` / `driftHeldOff`.

  **Acceptance criteria:**
  - [ ] A held-off LFO's controls are disabled, announce as disabled to assistive tech, still show their values, and show the label; re-enabling on a raised dial is immediate.
  - [ ] EQ-gain LFO frames stay enabled on Light; filter-frequency/Q frames grey out; the drift sliders grey out at Standard and below.
  - [ ] Existing Audio Rig render-count tests pass; an unrelated LFO change does not re-render a frame.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx src/components/ui/controls/Lfo.test.tsx`
  - [ ] Manual: sweep the dial; the frames grey/un-grey at the thresholds.

  **Dependencies:** Task 20

  **Files likely touched:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`, `src/components/ui/controls/Lfo.tsx`, `src/components/ui/controls/Lfo.test.tsx` (+ a CSS class for the label)

  **Estimated scope:** Medium (4–5 files)

- [x] **Task 22: Greyed-out LFO controls — Robot Options**

  **Description:** Same treatment for the per-robot LFO frames in Robot Options (Volume LFO in `AudioSettingSection`, the per-layer LFO frames and **Robot Drift** in `SignatureArrayDrawer`): held-off (over the robot-LFO cap) frames grey out with the label; Robot Drift greys with the drift tier.

  **Acceptance criteria:**
  - [ ] A robot LFO over the cap shows disabled with its value and the label; a robot LFO that is within the cap, or at `rate = 0`, is fully editable (so a user can still turn one *on*).
  - [ ] Robot Drift greys while `driftHeldOff`.
  - [ ] Existing tests in both drawers pass; no new render triggers on unrelated robot writes.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx src/components/robot/SignatureArrayDrawer.test.tsx`
  - [ ] Manual: with `?load=light`, enable more robot LFOs than the cap and see the extras grey out.

  **Dependencies:** Task 20

  **Files likely touched:** `src/components/robot/AudioSettingSection.tsx`, `src/components/robot/AudioSettingSection.test.tsx`, `src/components/robot/SignatureArrayDrawer.tsx`, `src/components/robot/SignatureArrayDrawer.test.tsx`

  **Estimated scope:** Small–Medium (4 files)

### Checkpoint E: LFO tiers complete
- [ ] Dial sweeps connect/disconnect the right LFOs; nothing stored changes; greyed-out state is correct in both places
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` green
- [ ] **Review with Crawford**

### Phase 6: Latency

- [x] **Task 23: Latency hint from the boot-time preset**

  **Description:** `audioContextSetup.ts` currently reads only `?latency=`. It now also resolves the *initial* audio load through `resolveInitialAudioLoad` (pure, no Tone or store import — it must run before any Tone node exists) and installs `latencyForLoad(load)`: Light → `playback`; Standard and Full leave Tone's default alone (decision J: `interactive`). An explicit `?latency=` still wins. The overlay's `latency` line already shows the hint in force.

  **Acceptance criteria:**
  - [ ] `?load=light` installs a `playback` context; `?load=standard` and `?load=full` install nothing (Tone's default); `?latency=balanced&load=light` installs `balanced`.
  - [ ] Auto-detection (coarse pointer) selects Light's hint at boot with no params; a desktop with no params installs nothing (no behavior change).
  - [ ] Changing the dial live never touches the context; the readout says latency applies on next load, and with the URL mirror (Task 16) a reload re-applies it.
  - [ ] Importing `tone` still happens only through this module first (the file remains `main.tsx`'s first app import; existing `audioContextSetup` tests pass).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioContextSetup.test.ts`
  - [ ] Manual: headless/browser `?debug&load=light` shows `latency playback` in the overlay and a single realtime AudioContext (the check used for `?latency=`).

  **Dependencies:** Task 5 (Task 16 for the reload story)

  **Files likely touched:** `src/engine/audioContextSetup.ts`, `src/engine/audioContextSetup.test.ts`

  **Estimated scope:** Small (2 files)

### Phase 7: Prove it, hand to Crawford, document

- [x] **Task 24: Full desktop measurement gates**

  **Description:** Measure the finished feature against the pre-change baseline (Task 3) with spec §5.3 criteria 1, 4 and 5. No product change unless a gate is missed, in which case report to Crawford — do not re-tune to pass.

  **Acceptance criteria:**
  - [ ] Criterion 4 (revised, spec decision M): **Light lowers the peak-window capacity ≥ 25% on `bravo` and ≥ 15% on `charlie` versus Full**; **Standard lowers `bravo`'s peak window ≥ 10% and its mean ≥ 0.10** (no `charlie` gate for Standard). 3 runs each, 4-minute series, interleaved, same session, foreground, no orphaned Chrome.
  - [ ] Criterion 1: **Full is within ±0.03 of the Task 3 baseline** (same-session A/B against a build of the pre-feature commit), and the full suite passes with no test modified for the sake of Full.
  - [ ] Criterion 5: the robot-LFO stress case (throwaway variant per Task 4's recipe requesting every robot's seeded LFOs) at Standard's and Light's caps keeps the callback interval ≈ 10.7 ms and capacity < 0.9.
  - [ ] Results, and any missed gate, recorded in `docs/PERFORMANCE.md` with the code measured named by commit.

  **Verification:**
  - [ ] Orphan check empty; `git status` clean; scratch builds deleted.

  **Dependencies:** Tasks 11, 20, 23

  **Files likely touched:** `docs/PERFORMANCE.md`

  **Estimated scope:** Small (docs only; ~45 minutes of runs)

- [x] **Task 25: Phone protocol and Crawford's run**

  **Description:** Prepare everything Crawford needs for the Pixel (spec §5.3 criterion 6), then record what he reports. The run itself is his.

  **Acceptance criteria:**
  - [ ] A ready-to-use protocol in `docs/todo/scratchy-audio-phones.md`: the LAN preview command (`npm run build && npx vite preview --host --port 4173`), and the URL matrix on the pinned worlds — `load=light`, `load=standard`, `load=standard&latency=playback`, `load=full`, each on `charlie` and `bravo`, 5 minutes each — with what to write down (dropouts, clicks versus before, the overlay's `sounding n/cap` and `audible` readings when clicks start, the `base` latency line).
  - [ ] Crawford's results are recorded verbatim (by ear) with a plain reading: which part of Light does the work, whether Standard needs `playback`, and what remains if Light is not enough (the spec's "further levers", not a failure).

  **Verification:**
  - [ ] The URLs load and power on from a LAN address (insecure context) — checked from this PC before handing over.

  **Dependencies:** Task 24

  **Files likely touched:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** Small (1 file; waits on Crawford)

- [x] **Task 26: Docs and roadmap close-out**

  **Description:** Bring the docs in line with what shipped, recording deviations from this plan.

  **Acceptance criteria:**
  - [ ] `docs/AUDIO_SYSTEM.md` and `docs/POLYPHONY_GUIDE.md`: the dynamic cap, the sounding set, why gating is at trigger time, the LFO tiers. `docs/ROBOT_LIFECYCLE.md`: audibility is now mute/solo **and** the budget; standing-by robots keep the full lifecycle. `docs/PERFORMANCE.md`: `?load=`, the measurements, dated baselines (recorded, not overwritten).
  - [ ] `docs/todo/roadmap.md` 17.2.6 marked done with the as-shipped summary; the spec gets an "As Shipped" section and this file an "As Shipped — deviations" section (the pattern `ACCORDION_LAZY_MOUNT.md` set); the scratchy-audio doc gets the final results; the two specs are added to `CLAUDE.md`'s reference list if Crawford wants.
  - [ ] Every path and constant named in the docs was checked against the code (the "verify against code" rule from this repo's history).

  **Verification:**
  - [ ] Links resolve (spot-check with a grep for each new relative link); `npm test` still green.

  **Dependencies:** Task 25

  **Files likely touched:** `docs/AUDIO_SYSTEM.md`, `docs/POLYPHONY_GUIDE.md`, `docs/ROBOT_LIFECYCLE.md`, `docs/PERFORMANCE.md`, `docs/todo/roadmap.md`

  **Estimated scope:** Medium (5 files, docs only)

### Checkpoint F: Complete
- [ ] All spec §5.3 criteria met, or each miss is reported with numbers and Crawford has decided
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` green
- [ ] Docs updated; branch ready for review (no push until Crawford says so)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The audible-robot lever is weaker than the spec assumes (the correlation is an inference from a simulation and one time series) | High | Tasks 1–3 test it before any product change; Task 11 re-tests the caps alone before UI/LFO work; both are explicit stop-and-report gates |
| The phone's real budget differs from desktop numbers | High | Desktop gates prove *direction*, the phone check (Task 25) reads the overlay at the moment clicks start and compares Light's parts separately; a shortfall points to the next lever, not to failure |
| Robot-LFO caps set from too little data | Med | Task 4 measures per target type; Task 24 stress-tests at the chosen caps; the constants are one line each |
| LFO suppression is new `lfoEngine` behavior (connect/disconnect on a live dial) | Med | Tasks 17–19 land one kind at a time with round-trip and "no stored value changes" tests; default (no policy) is asserted unchanged |
| Store-subscription churn from `updateRobot` (12×/measure) | Med | Signature string + write-only-on-change (Task 9) with a 200-measure write-count test; boolean per-robot selectors in the UI (Tasks 13, 21, 22) |
| A lower polyphony cap strands the voice counter | Med | Cap applies to new triggers only; a dedicated test in Task 8; `killAll()` still resets the counter |
| First-come fairness: late robots silent for most of their Active time | Low–Med | Accepted (decision 2); the battery cycle bounds it; take-turns stays a later change to `reconcileSounding` alone |
| Auto-detection misjudges a device | Low | The control and `?load=` are always available; the overlay shows the level in force |
| Backlog #29 flaky tests confuse a red suite | Low | Re-run in isolation before blaming a task (Definition of Done) |
| Measurement noise (same-world stock ranged 0.30–0.41 across rounds) | Med | Same-session interleaved A/B, ≥ 3 runs, differences from same-round baseline, foreground runs, orphan checks |

## Spec addenda (small things this plan resolved that the spec left implicit)

Folded into the spec in the same commit as this plan:

1. **Drift sliders grey out too.** Spec §1.4 says a held-off LFO's controls are greyed; the drift controls (per-group Drift sliders in the Audio Rig, Robot Drift in Robot Options) are the "stacked LFO" controls, so they follow the drift tier (Tasks 21–22).
2. **`layerN.phase` robot LFOs are not counted toward the cap** — they use a control-rate `scheduleRepeat` poll (`phaseFallbacks`), not an audio-rate connection, and were not part of the measured cost (Task 19).
3. **"Held off" means requested but not connected** — an LFO at `rate = 0` is never held off, so a user can always turn one on; a robot LFO turned on beyond the cap greys out after the attempt (Tasks 17, 19, 22).
4. **Two early stop-and-report gates** (Checkpoint A, Task 11) sit before the UI and LFO work, because the spec's central inference is the least-tested part.
5. **Decision J is resolved**: Standard stays `interactive`.

## Open Questions

None blocking. For Crawford at the checkpoints: the lore/label copy for the Audio Load panel and "Standing by" (Checkpoint D), and whether to add the two new specs to `CLAUDE.md`'s reference list (Task 26).

---

## As Shipped — deviations (2026-09-21)

Tasks 1–26 are done (task-level boxes above are ticked); **task 25's phone run was done by Crawford on 2026-09-21 and is recorded with a plain reading in the scratchy-audio doc — the reading was followed on 2026-09-21 by Crawford's decisions: Standard's latency stays `interactive` pending a rested re-run, and the missed task-24 gate is accepted and re-set (spec §7 J and N)**. Each task's acceptance criteria were met and are evidenced by its commit message and tests (the per-criterion boxes were not ticked individually). Order of work followed the plan; Checkpoint A was reported and continued, **Checkpoint C (task 11) stopped on a missed gate and resumed on Crawford's decision (option 2, spec decision M)**, Checkpoints B, D, E and the task-24 gate were run as written.

Deviations, by task (the full list with reasons is in [the spec's §8](../specs/AUDIO_LOAD_BUDGET.md#8-as-shipped-2026-09-21)):
- **Task 2** was a rewrite, not a promotion — the scratch scripts had not been kept. Later additions: the `audible` and caps columns (tasks 1 and 10), `world@page` for same-session A/B builds (task 24).
- **Task 3**'s literal both-worlds-pooled correlation (0.38) was below the plan's ~0.5 stop line because `bravo`'s LFOs add an offset; the within-world figures (0.74–0.94) were used and the call was flagged.
- **Task 6** added `orderByArrival` (eligible ids in arrival order). **Task 9**: `stopAudioBudget()` releases restrictions; the system also watches the Attenuation Style store for locale switches.
- **Task 11** missed both gates (Light −18 %, Standard −1 %); Crawford chose to keep the anchors and re-set the gates.
- **Task 12**: there was no audibility colour mapping to extend; `isRobotSounding` (empty list = budget not running = sounding) was added for the cards' per-robot boolean selectors.
- **Task 14**'s readout includes the tight robot-LFO limit. **Task 16**'s omission rule is default-based (correct on phones).
- **Task 17/19/20**: the policy carries the connected robot-LFO count; `reconcileLfos` is two-pass and re-admits a freed slot; `lfoEngine.subscribeHeldOff` mirrors held-off state into the store. **Task 18**'s tests live in `lfoEngine.test.ts` (that is where the Tone mocks are), not a new `lfoDrift.test.ts`.
- **Tasks 21–22**: a shared `HeldOffNote`; `LfoTargetGroup.heldOff` and the Robot Options props keep the sections store-free.
- **Task 23** was checked in a real browser (`?load=light` → `playback`, one live realtime context).
- **Task 24**: one gate missed (Standard's mean on `bravo`, 0.069 vs ≥ 0.10; accepted and re-set on 2026-09-21, spec decision N); everything else met.
- **Task 26** records the close-out; `CLAUDE.md`'s reference list was left alone (offered, not requested).
