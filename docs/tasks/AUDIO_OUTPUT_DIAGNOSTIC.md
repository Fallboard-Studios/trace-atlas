# Implementation Plan: Audio Output Diagnostic

Source spec: [docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md](../specs/AUDIO_OUTPUT_DIAGNOSTIC.md) (Draft v2, approved by Crawford 2026-09-21; nothing built). A follow-up to [Roadmap 17.2.6](../todo/roadmap.md#1726-performance-audio-load-budget); background in [docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md) and decision P in [the Audio Load Budget spec](../specs/AUDIO_LOAD_BUDGET.md#decisions-resolved-2026-09-20-crawford).

## Overview

Add a read-only, `?debug`-only diagnostic that tells a **silent graph** from **loss after the graph**: two `Analyser` taps (after EQ3 and after `masterGain`) giving peak / RMS / finite readings, a silent-while-sounding event, a non-finite event, and a read of the browser's own `AudioContext.playbackStats` (underrun counts, latency). Plus a hook so the taps survive the Natural/Controlled Decay rewire. Three `bravo` dropouts left every existing overlay reading normal, so what fails is something the overlay does not measure.

**Ordering principles**

1. **Prove the risky assumption first.** Spec assumption 3 — an `AnalyserNode` with no output connection is still processed in Chrome — is unverified and everything else rests on it. Task 1 tests it before any product code. A failure stops the plan (the fallback, a silent sink node, is an ask-first spec change).
2. **Vertical slices, each usable on the phone.** Slice A gives the level readout end to end (tap → measure → sampler → overlay line); Slice B gives the `playbackStats` line and its underrun events; Slice C adds the silent and non-finite events and the red status. A phone build can be handed over after Checkpoint A or B — Crawford may get a chance to test tonight, and a readout is useful before the event logic exists.
3. **Diagnostics never change behaviour.** Every task leaves the app identical when `?debug` is absent (no analyser constructed) and the existing suite green.
4. **Pure core, thin shells, TDD.** Decisions are pure functions in `audioHealth.ts`; `audioDiagnostics.ts` and `globalFx.ts` are shells; RED first, seen failing for the right reason.

## Architecture Decisions

- **Taps live in `globalFx.ts`, are lazy, and are ref-counted by the sampler** (spec §3). `startAudioDiagnostics()` attaches them on the first reference, the last stop handle detaches and disposes. `buildGlobalFxChain` / `wireGlobalFxChain` construct nothing on their own.
- **One re-attach hook at the end of `wireGlobalFxChain`** (spec §1.5, approved). It covers both the toggle flip (`disconnectAllFxNodes` drops the taps) and "overlay started before the chain was built" (the chain is built at first power-on; `buildGlobalFxChain` calls `wireGlobalFxChain`). It does nothing unless taps were requested.
- **Levels are measured in the sampler, once per tick.** `sample()` reads both taps once, runs `measureLevel`, and hands the same readings to the snapshot (display) and to `stepDiag` (events) — no double read of a 128 KB buffer.
- **`DiagSample` gains optional fields; `initDiagState` supplies defaults** (spec §4), so existing tests pass unmodified.
- **`playbackStats` is read defensively and never mutated** — absent, throwing or non-numeric all become `null` (`n/a` on the overlay); `resetLatency()` is never called.
- **Stacked commits on `bugs/scratchy-audio-phones`, one per task, no push** until Crawford says so.
- **Throwaway probes and browser scripts are never committed** (scratchpad; only results land in docs), as in the Audio Load Budget plan.

## Definition of Done (every task)

The skill's `definition-of-done.md` is not present on this machine (same as the Audio Load Budget plan), so this repo's bar applies, in addition to each task's acceptance criteria:

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint (152 files / 3191 tests before this work). Backlog #29's flaky tests may fail intermittently — re-run in isolation before blaming the change; a `Timeout calling "onTaskUpdate"` worker error has also been seen on green runs.
- [ ] **No existing test case or assertion altered.** Adding a mock or setup to a test file so it can import a changed module is allowed (Tasks 3 and 5 need it).
- [ ] `CLAUDE.md` PR checklist: no synths/analysers in components; nothing runtime in Zustand; no timer-driven *musical* timing (the 500 ms sampler is diagnostic, precedent in `audioDiagnostics.ts`).
- [ ] **RED first** — the new test is run and seen to fail for the right reason before the code.
- [ ] **Mutation-checked** — each new gate is broken on purpose and a test is seen to fail (the spec §5.2 list; results noted in the commit message).
- [ ] With `?debug` absent nothing new is constructed or connected (covered by a test from Task 3 on).
- [ ] One commit per task, tests with their code, message ends with the session's attribution line. No push.

## Dependency Graph

```
Task 1 (probe: unconnected analyser is processed) ── GATE: stop if it fails
   │
   ├──→ Task 2 (pure: measureLevel, peakToDb)
   └──→ Task 3 (globalFx taps: attach/detach/read) ──→ Task 4 (re-attach hook)
Tasks 2, 4 ──→ Task 5 (SLICE A shell + overlay: level line) ──→ Task 6 (real browser: levels, mute, toggle)
                                  ── Checkpoint A: levels end to end  (phone build 1 possible) ──
Task 7 (pure: underrun edge events)          [audioHealth.ts, after Task 2]
Tasks 5, 7 ──→ Task 8 (SLICE B shell + overlay: playbackStats line, red on underruns) ──→ Task 9 (real browser: stats line)
                                  ── Checkpoint B: playback stats end to end  (phone build 2 possible) ──
Task 7 ──→ Task 10 (pure: silent-while-sounding) ──→ Task 11 (pure: non-finite)
Tasks 5, 8, 10, 11 ──→ Task 12 (SLICE C shell + overlay: expectSound wiring, events, red status) ──→ Task 13 (real browser: mute/toggle/forced silence)
                                  ── Checkpoint C: all events ──
Task 13 ──→ Task 14 (docs + corrections) ──→ Task 15 (As Shipped + handoff)
Task 15 ──→ Task 16 (Crawford's phone run; recorded)
                                  ── Checkpoint D: complete ──
```

Tasks that share `audioHealth.ts` (2, 7, 10, 11) are strictly sequential. Task 3–4 (`globalFx.ts`) is independent of Tasks 2 and 7 and could run in parallel with them; sequential numeric order is still recommended (each is small).

## Task List

### Phase 0: Prove the assumption

- [x] **Task 1: Probe — an analyser with no output connection is processed; a `disconnect()` drops it; units of `playbackStats`**

  **Description:** A throwaway page driven over CDP in headless Chrome 153 (real time, foreground; the perf harness's pattern) builds `Oscillator(440 Hz) → Gain(0.5) → destination` and attaches a native `AnalyserNode` (`fftSize` 32768) fed from the gain and connected to nothing. It reads the buffer, then calls `gain.disconnect()` and reads again, and reads `playbackStats` after a few seconds. This is the one assumption (spec §0.3) the design cannot survive being wrong about; nothing is committed but the result.

  **Acceptance criteria:**
  - [ ] The unconnected analyser reads a peak ≥ 0.4 (the signal is ~0.5) — it is processed.
  - [ ] After `gain.disconnect()` the analyser's buffer reads < 1e-4 within one buffer length — a rewire really does drop a tap (the reason for Task 4).
  - [ ] `playbackStats.totalDuration` grows in step with elapsed seconds (±20 %) and `averageLatency` is in the 0.001–0.5 range, fixing the units as **seconds** (the spec's assumption for the latency and duration lines).
  - [ ] The three results are recorded under "Task results" below. **If the first fails, stop and report** — the fallback (a `Gain(0)` sink to the destination) changes the spec and is ask-first.

  **Verification:**
  - [ ] Chrome process count identical before and after; run in the foreground, one call.

  **Dependencies:** None

  **Files likely touched:** `docs/tasks/AUDIO_OUTPUT_DIAGNOSTIC.md` (results only)

  **Estimated scope:** XS

### Checkpoint 0: the design's foundation holds
- [x] Task 1's three results recorded; the first is a pass (see "Task results"). Otherwise stop and report to Crawford.

### Phase 1: Slice A — the level readout, end to end

- [x] **Task 2: Pure level maths — `measureLevel`, `peakToDb`**

  **Description:** In `audioHealth.ts` add `LevelReading` (`peak`, `rms`, `nonFinite`), `measureLevel(samples)` and `peakToDb(peak)` exactly as sketched in spec §4. NaN and ±Infinity are counted and excluded from peak and RMS; an empty buffer is `null`.

  **Acceptance criteria:**
  - [ ] Silence: peak 0, RMS 0, `peakToDb(0) === -Infinity`.
  - [ ] A sine of amplitude *a*: peak = *a* and RMS = *a*/√2 within tolerance.
  - [ ] One NaN and one ±Infinity among finite samples: `nonFinite` counts them and peak / RMS equal the finite-only values; an all-non-finite buffer gives peak 0, `nonFinite` = length.
  - [ ] Empty input → `null`; a single sample works.

  **Verification:**
  - [ ] `npx vitest run src/utils/audioHealth.test.ts` passes (existing cases untouched); mutation: make `measureLevel` include NaN in the sum → the NaN test fails.
  - [ ] `npm run build:types` and `npm run lint` clean.

  **Dependencies:** Task 1

  **Files likely touched:** `src/utils/audioHealth.ts`, `src/utils/audioHealth.test.ts`

  **Estimated scope:** S

- [x] **Task 3: Output taps in `globalFx` — attach, detach, read** *(built with native `AnalyserNode`s, not `Tone.Analyser` — see "Task 6" under Task results)*

  **Description:** Add `OUTPUT_TAP_SIZE = 32768`, `attachOutputTaps()`, `detachOutputTaps()` and `readOutputTaps()` to `globalFx.ts` for the case where the chain already exists. Two `Tone.Analyser('waveform', OUTPUT_TAP_SIZE)` nodes: EQ3's output → *pre*, `masterGain`'s output → *master*. `attachOutputTaps` also sets a module "wanted" flag (used by Task 4). `readOutputTaps` returns the two buffers, narrowing Tone's `Float32Array | Float32Array[]` union (confirmed from the typings: `getValue(): Float32Array | Float32Array[]`). Every construction is guarded like the existing ones.

  **Acceptance criteria:**
  - [ ] After `buildGlobalFxChain()` and `wireGlobalFxChain(false|true)` **with no attach**, zero `Analyser`s have been constructed (criterion 1).
  - [ ] `attachOutputTaps()` after the build constructs two waveform analysers of `OUTPUT_TAP_SIZE`, connects EQ3 → pre and `masterGain` → master, and connects them to nothing else (never to the destination).
  - [ ] `readOutputTaps()` returns `{ pre, master }` as `Float32Array`s when attached, `null` entries when not attached or when the FX nodes are absent (headless); it never throws.
  - [ ] `detachOutputTaps()` disconnects and disposes both, clears the wanted flag, is idempotent, and is safe with nothing attached.
  - [ ] A `connect` that throws is caught and `devWarn`ed, never propagated.
  - [ ] `OUTPUT_TAP_SIZE / 44100 * 1000 ≥ SAMPLE_INTERVAL_MS` (a buffer must cover a whole sampler interval).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts` passes — the Tone mock gains `Analyser`; every existing test, including the exact connection-sequence ones, passes unchanged.
  - [ ] Mutation: construct an analyser inside `buildGlobalFxChain` → the zero-analysers test fails.

  **Dependencies:** Task 1

  **Files likely touched:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** M

- [x] **Task 4: The re-attach hook — taps survive a rewire and an early start**

  **Description:** Call a small `connectTapsIfWanted()` at the end of `wireGlobalFxChain` (both topologies). It reconnects the taps if they were requested and the nodes exist, and does nothing otherwise. This is the one production-path touch (spec §0.6): it covers the Natural/Controlled Decay toggle (`disconnectAllFxNodes` drops every output of every FX node) and "attach before the chain is built" (build calls wire).

  **Acceptance criteria:**
  - [ ] `attachOutputTaps()` *before* `buildGlobalFxChain()` ends with both taps connected after the build (criterion 2).
  - [ ] `wireGlobalFxChain(true)` then `wireGlobalFxChain(false)` leaves both taps connected, each still connected once and to the same targets (criterion 3).
  - [ ] With taps never requested, `wireGlobalFxChain` behaves exactly as before — the existing exact-sequence and "disconnects every real node before reconnecting" tests pass unchanged.
  - [ ] After `detachOutputTaps()`, a later wire does not reconnect them.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts` passes.
  - [ ] **Mutation:** delete the hook call → both the early-attach test and the toggle test fail.

  **Dependencies:** Task 3

  **Files likely touched:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** S

- [x] **Task 5: Slice A shell and overlay — sample the taps, show the level line**

  **Description:** `startAudioDiagnostics()` attaches the taps on the first reference and the last stop handle detaches them. Each `sample()` reads the two taps once, runs `measureLevel` on each, and stores the readings in a module variable; `readInfo()` puts them into `DiagInfo` (`outputPre`, `outputMaster`, `null` in `emptyInfo`). `buildHudLines` gains one line, ≤ 52 characters, e.g. `out -12.3dB rms -20.1  pre -13.0dB  fin ok` (unknown → `-`, silence → `-inf`, any non-finite → `fin NaN!`); the exact format is fixed by the tests written first. No other existing line changes. `audioDiagnostics.test.ts` gains a `vi.mock('./audioEngine/globalFx', …)` because its Tone mock has no constructors.

  **Acceptance criteria:**
  - [ ] Starting attaches once (ref-counted: a second start does not attach again); stopping the last handle detaches; stopping a non-last handle does not.
  - [ ] One `readOutputTaps()` call per sample; the readings appear in the published snapshot; a `null` tap gives `null`.
  - [ ] The HUD line shows peak dB, RMS dB and pre-chain peak dB from the snapshot, `-` for unknown, `-inf` for silence, and marks non-finite; it is ≤ 52 characters for realistic values.
  - [ ] All existing `audioDiagnostics`, `hudLines` and `AudioDebugHud` tests pass unchanged (if `AudioDebugHud.test.tsx` counts lines, a case is added, not edited).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioDiagnostics.test.ts src/components/debug` passes.
  - [ ] Mutation: skip the detach on the last stop → the ref-count test fails; format the pre reading from the master → the HUD test fails.
  - [ ] `npm run build:types` and `npm run lint` clean.

  **Dependencies:** Tasks 2, 4

  **Files likely touched:** `src/engine/audioDiagnostics.ts`, `src/engine/audioDiagnostics.test.ts`, `src/components/debug/hudLines.ts`, `src/components/debug/hudLines.test.ts`

  **Estimated scope:** M

- [x] **Task 6: Real browser — levels are live, mute splits the taps, the toggle does not break them**

  **Description:** Production build, headless Chrome 153 over CDP (foreground, one call, process count before and after), `?debug&seed=charlie&x=200&y=-30`, power on. Read the overlay text. For the toggle, click the Natural/Controlled Decay control in the Audio Rig; if driving the UI is impractical, run the same check against `npm run dev` and flip it with a dynamic `import()` of the store. A throwaway script; only the results are recorded.

  **Acceptance criteria:**
  - [ ] Within 60 s of power-on, `out` and `pre` read finite values above −80 dB while robots sound (assumption 3 confirmed in the real app, not just the probe).
  - [ ] Muting the master drops `out` below −80 dB while `pre` stays live; unmuting restores it — the two-tap discrimination, seen for real.
  - [ ] Flipping Natural ↔ Controlled Decay leaves both readings live afterwards.
  - [ ] No console errors; the Chrome process count is the same before and after.

  **Verification:**
  - [ ] Results recorded under "Task results". Full suite (`npm test`) green.

  **Dependencies:** Task 5

  **Files likely touched:** `docs/tasks/AUDIO_OUTPUT_DIAGNOSTIC.md` (results only)

  **Estimated scope:** S

### Checkpoint A: levels end to end
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all pass; Task 6's results recorded. (One intermittent unrelated test failure that passes in isolation — see "Task results".)
- [ ] **Optional phone build 1** *(Crawford: the phone build can wait until the end)* (level line only): Crawford runs `npm run build && npx vite preview --host --port 4173` and loads `?debug&seed=bravo&x=-150&y=90&load=full`. Review with Crawford before continuing.

### Phase 2: Slice B — the browser's playback stats, end to end

- [x] **Task 7: Pure underrun events**

  **Description:** In `audioHealth.ts` add `PlaybackReading` (`underrunEvents`, `underrunDuration`, `totalDuration`, `averageLatency`, `minimumLatency`, `maximumLatency`), an optional `DiagSample.playback`, the state it needs, and edge events in `stepDiag`: one "playback underruns began (n total)" when the count rises, none while it keeps rising, one "underruns stopped after X s (+Y)" after `UNDERRUN_QUIET_MS = 1000` (two samples) without a rise. A count that goes *down* (a new context) is a new baseline, not an event.

  **Acceptance criteria:**
  - [ ] Count unchanged → no event; first rise → exactly one "began" event; further rises while active → none.
  - [ ] ≥ 1 s without a rise → exactly one "stopped" event carrying the burst's duration and the added count; a later rise starts a new burst.
  - [ ] `playback` absent or `null` → no events, no throw; a decreasing count → baseline reset, no event.
  - [ ] `timing` exposes whether underruns are currently active (for the red status in Task 8).

  **Verification:**
  - [ ] `npx vitest run src/utils/audioHealth.test.ts` passes (existing cases untouched). Mutation: drop the quiet-period debounce → the "stopped" timing test fails; treat a decrease as a rise → the reset test fails.

  **Dependencies:** Task 2 (same file)

  **Files likely touched:** `src/utils/audioHealth.ts`, `src/utils/audioHealth.test.ts`

  **Estimated scope:** S

- [x] **Task 8: Slice B shell and overlay — read `playbackStats`, show the line, red on underruns** *(the reader also looks behind Tone's wrapper — see "Task 9" under Task results)*

  **Description:** In `audioDiagnostics.ts` add a defensive `readPlaybackStats(raw)` (absent, throwing or non-numeric → `null`; latency and duration converted seconds → milliseconds for display; `resetLatency()` never called), pass the reading into `stepDiag`, and publish it in `DiagInfo`. `buildHudLines` gains one line, ≤ 52 characters: `underruns 3 (12ms) · lat 21ms (20-34)`, or `underruns n/a` when the API is absent. `hudStatus` goes `'bad'` while underruns are active.

  **Acceptance criteria:**
  - [ ] A context with `playbackStats` produces the reading and the line; without it the line reads `underruns n/a` and no event fires.
  - [ ] A getter that throws, or non-numeric fields, yield `null` and `n/a`, never an exception; the mock's `resetLatency` is never called.
  - [ ] Latency / duration are shown in milliseconds; totals as integers.
  - [ ] `hudStatus` is `'bad'` while an underrun burst is active and `'ok'` afterwards (all existing `hudStatus` cases unchanged).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioDiagnostics.test.ts src/components/debug` passes. Mutation: call `resetLatency()` in the reader → the never-called test fails; drop the underrun term from `hudStatus` → the red-status test fails.
  - [ ] `npm run build:types` and `npm run lint` clean.

  **Dependencies:** Tasks 5, 7

  **Files likely touched:** `src/engine/audioDiagnostics.ts`, `src/engine/audioDiagnostics.test.ts`, `src/components/debug/hudLines.ts`, `src/components/debug/hudLines.test.ts`

  **Estimated scope:** M

- [x] **Task 9: Real browser — the stats line renders with real numbers**

  **Description:** Same headless setup as Task 6. Read the overlay for a minute or two.

  **Acceptance criteria:**
  - [ ] The `underruns` line shows numbers (not `n/a`) on Chrome 153, with `totalDuration`-derived values growing and latency in a plausible millisecond range.
  - [ ] No console errors; process count unchanged.
  - [ ] Recorded as-observed: how many underruns a calm desktop run shows (the phone comparison baseline). An underrun burst can optionally be provoked with the robot-LFO stress recipe in `docs/PERFORMANCE.md`; if it is not, the burst logic stays covered by Task 7's unit tests and the phone provides the real thing.

  **Verification:**
  - [ ] Results recorded under "Task results". Full suite green.

  **Dependencies:** Task 8

  **Files likely touched:** `docs/tasks/AUDIO_OUTPUT_DIAGNOSTIC.md` (results only)

  **Estimated scope:** XS

### Checkpoint B: playback stats end to end
- [x] Gates pass (`build:types`, `lint`, `npm test`, `npm run build`); Task 9's results recorded. (One intermittent failure, the known #29 test, passing in isolation.)
- [ ] **Optional phone build 2** *(Crawford: the phone build can wait until the end)* (level line + underrun line). Review with Crawford before continuing.

### Phase 3: Slice C — silence and non-finite events, and the red status

- [x] **Task 10: Pure silent-while-sounding event**

  **Description:** Add `SILENT_PEAK_THRESHOLD = 1e-4` (−80 dBFS) and `SILENT_EVENT_AFTER_MS = 3000`, optional `DiagSample` fields `master`, `pre` (`LevelReading | null`) and `expectSound`, and the state to time the condition. The event reads "master output silent for 3s while notes sound (pre-chain normal | silent | unknown)"; a recovery event carries the duration. The condition is `master.peak < threshold && expectSound`, and any break in it resets the timer.

  **Acceptance criteria:**
  - [ ] No event before 3 s of continuous silent + expected samples; exactly one at 3 s; none while it continues; exactly one recovery event.
  - [ ] The event names the pre-chain state: `normal` (pre peak ≥ threshold), `silent`, or `unknown` (pre `null`).
  - [ ] Not raised when `expectSound` is false; a single sample that is not silent, or not expected, resets the timer; a `null` master reading never raises it.
  - [ ] `timing` exposes whether the silent condition is active (for the red status in Task 12).

  **Verification:**
  - [ ] `npx vitest run src/utils/audioHealth.test.ts` passes. Mutation: change `>=` to `>` at the 3 s boundary → the boundary test fails; drop the `expectSound` term → the guard test fails.

  **Dependencies:** Task 7 (same file)

  **Files likely touched:** `src/utils/audioHealth.ts`, `src/utils/audioHealth.test.ts`

  **Estimated scope:** S

- [x] **Task 11: Pure non-finite events**

  **Description:** One event when a tap first shows non-finite samples ("non-finite samples in master output" / "…in pre-chain output") and one when it clears, per tap, edge-triggered like the other events.

  **Acceptance criteria:**
  - [ ] Each tap raises one entry event and one exit event, independently.
  - [ ] A tap that stays non-finite raises nothing further; `null` readings raise nothing.
  - [ ] `timing` exposes whether either tap is currently non-finite.

  **Verification:**
  - [ ] `npx vitest run src/utils/audioHealth.test.ts` passes. Mutation: fire on every non-finite sample → the "no repeat" test fails.

  **Dependencies:** Task 10 (same file)

  **Files likely touched:** `src/utils/audioHealth.ts`, `src/utils/audioHealth.test.ts`

  **Estimated scope:** S

- [x] **Task 12: Slice C shell and overlay — `expectSound`, the readings into `stepDiag`, red status**

  **Description:** In `sample()`, pass the readings already taken in Task 5, plus `expectSound = voices > 0 && getMasterVolume() > 0 && transport 'started' && context 'running'`, into `stepDiag`. `hudStatus` becomes `'bad'` while the silent condition or a non-finite tap is active, in addition to the existing and underrun conditions. The volume-0 false positive (a sounding robot whose own volume is 0) is accepted and documented, not handled.

  **Acceptance criteria:**
  - [ ] `expectSound` is true only when all four terms hold; each term flipped alone makes it false (four cases).
  - [ ] The same reading object feeds the snapshot and `stepDiag` (one `readOutputTaps()` call per sample still).
  - [ ] `hudStatus` is `'bad'` while silent-while-sounding or non-finite is active and `'ok'` afterwards; every existing status case is unchanged.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioDiagnostics.test.ts src/components/debug` passes. Mutation: drop the master-volume term → the mute-guard test fails; drop the non-finite term from `hudStatus` → the status test fails.
  - [ ] `npm run build:types` and `npm run lint` clean.

  **Dependencies:** Tasks 5, 8, 10, 11

  **Files likely touched:** `src/engine/audioDiagnostics.ts`, `src/engine/audioDiagnostics.test.ts`, `src/components/debug/hudLines.ts`, `src/components/debug/hudLines.test.ts`

  **Estimated scope:** M

- [x] **Task 13: Real browser — mute and toggle raise nothing; a forced silence raises the event** *(the forced-silence timing criterion was missed at first; resolved with Crawford's option 1 — see "Task 13" under Task results)*

  **Description:** Same headless setup (production build for the mute and toggle checks; the dev server for the forced silence, which needs a dynamic `import()` of `globalFx`). Forced silence: disconnect the chain entry (`getGlobalChainEntry().disconnect()`), which silences everything after EQ3, then restore with `wireGlobalFxChain(false)`. Note that this also drops the pre tap's own connection, so the real-browser run exercises the "both silent" branch; the "pre normal, master silent" branch is covered by Task 10's unit tests.

  **Acceptance criteria:**
  - [ ] Muting the master for > 10 s raises **no** silent event and does not turn the overlay red.
  - [ ] Flipping Natural ↔ Controlled Decay raises **no** silent event.
  - [ ] Forced silence raises the silent event, the overlay goes red, and after the restore a recovery event appears and the border clears. *(Revised 2026-09-21 after the first run: the original "within about 3.5 s" assumed instant silence and no gaps between notes; the event now comes after the FX tail-out (≈ 2 s here) plus 3 s of counted silence plus any note gaps — 5–8 s observed.)*
  - [ ] No console errors; process count unchanged.

  **Verification:**
  - [ ] Results recorded under "Task results". Full suite (`npm test`) green.

  **Dependencies:** Task 12

  **Files likely touched:** `docs/tasks/AUDIO_OUTPUT_DIAGNOSTIC.md` (results only)

  **Estimated scope:** S

### Checkpoint C: all events
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all pass (152 files, 3316 tests); Task 13's results recorded.
- [x] Spec §5.3 criteria 1–9 met, or each miss reported with the evidence. (One miss, the forced-silence timing, reported and resolved with Crawford's option 1; the spec's criteria 5 and 9 wording changes are listed for the As Shipped section.)

### Phase 4: Docs and handoff

- [ ] **Task 14: Documentation and the two corrections**

  **Description:** `docs/PERFORMANCE.md` — the `?debug` overlay section gains the two new lines and the reading table from spec §1, plus the underrun semantics as actually observed (units, what a calm desktop run shows). `docs/AUDIO_SYSTEM.md` "Debug Tools" gains one line and a link. `docs/todo/scratchy-audio-phones.md` gets a dated correction note beside each of the two claims that `playoutStats` / `renderCapacity` are absent (the name checked was the old one; `playbackStats` is present on Chrome 153) — **append a note, do not rewrite the history**. `docs/todo/roadmap.md` 17.2.6 gets one sentence. Every path, constant and function named is checked against the code first.

  **Acceptance criteria:**
  - [ ] Each of the four files is updated as described; every relative link and anchor added resolves (spot-checked with grep).
  - [ ] The two corrections are dated notes that leave the original text intact.
  - [ ] Every constant and function named in the new docs exists in the code with the stated value.

  **Verification:**
  - [ ] `npm test` still green (docs only; run once as the checkpoint).

  **Dependencies:** Task 13

  **Files likely touched:** `docs/PERFORMANCE.md`, `docs/AUDIO_SYSTEM.md`, `docs/todo/scratchy-audio-phones.md`, `docs/todo/roadmap.md`

  **Estimated scope:** M

- [ ] **Task 15: As Shipped and the phone handoff**

  **Description:** Add an "As Shipped" section to the spec and an "As Shipped — deviations" section to this file (the pattern the Audio Load Budget set), tick the task boxes, and write the handoff for Crawford: the exact LAN-preview commands, the URLs, what each new overlay line means (the reading table), what to screenshot at a dropout, and a request to note the phone's Chrome version (`chrome://version`) so an `n/a` on the underrun line can be read correctly.

  **Acceptance criteria:**
  - [ ] Deviations from this plan are listed with reasons (or "none").
  - [ ] The handoff is in the docs (not only in chat) and matches the built overlay's actual line formats.

  **Verification:**
  - [ ] Links resolve; full suite green.

  **Dependencies:** Task 14

  **Files likely touched:** `docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md`, `docs/tasks/AUDIO_OUTPUT_DIAGNOSTIC.md`

  **Estimated scope:** S

- [ ] **Task 16: Crawford's phone run — recorded**

  **Description:** Prepared by Task 15; the run itself is Crawford's (spec §5.3 criterion 12). He loads `?debug&seed=bravo&x=-150&y=90&load=full` (and any other run he chooses) on the Pixel and reads the new lines at a dropout. Record his report and screenshots' readings in `docs/todo/scratchy-audio-phones.md` with a plain reading using the spec's table. Whatever it shows — including `n/a` — is a finding, not a failure.

  **Acceptance criteria:**
  - [ ] His report is recorded verbatim with the overlay readings transcribed and a plain reading: graph-silent vs lost-after-graph vs underruns, and whether the clicks are underruns.

  **Verification:**
  - [ ] Links resolve; the reading is stated with its confounders, as in the 2026-09-21 run.

  **Dependencies:** Task 15 (and Crawford's time)

  **Files likely touched:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** S (waits on Crawford)

### Checkpoint D: complete
- [ ] Spec §5.3 criteria 1–11 met, or each miss reported and Crawford has decided; criterion 12 is his run.
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` pass. Not pushed.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| An unconnected `AnalyserNode` is not processed | Every level reads 0; false silent events | **Task 1 first, with a stop gate**; the fallback (a `Gain(0)` sink) is ask-first |
| The hook misses a rewire path other than the toggle | A tap goes dead, false silent event | The hook runs at the end of *every* `wireGlobalFxChain`; the event text names the pre-chain state and the raw levels stay on the overlay so a dead tap is visible; Task 13 exercises a rewire |
| The Tone `Analyser` returns a different shape than the typings suggest | `readOutputTaps` throws or returns wrong data | Task 3 reads the installed typings (`getValue(): Float32Array | Float32Array[]`) and narrows explicitly; Task 6 checks real values |
| `playbackStats` units or semantics differ from the assumption | Misread numbers | Task 1 fixes the units empirically; Task 14 records the observed behaviour; the spec table treats the line as a count and a trend, not an absolute |
| Existing tests break because `audioDiagnostics.ts` now imports `globalFx` | Suite failures in unrelated files | Task 5 adds a `globalFx` mock to that test file first (RED shows the failure), and the full suite runs at Checkpoint A |
| Observer effect: two analysers on the suspect graph | Could nudge the load being measured | Debug-only; recorded in the handoff so Crawford can weigh it |
| The pre tap dies with a rewire but the master tap survives (or the reverse) | Misleading "pre-chain silent" text | Both taps are re-attached together by one function; the toggle test asserts both |

## Spec addenda (small things this plan resolved that the spec left implicit)

- **Slicing by capability, not by file.** The spec's §5.2 lists tests by area; this plan delivers levels (A), playback stats (B) and events (C) as separate end-to-end slices so a phone build is possible after A or B.
- **The sampler reads the taps once per tick** and feeds the same reading to the snapshot and to `stepDiag`.
- **`DiagInfo` carries what is displayed; `DiagSample` carries what the edge events need** — the same `LevelReading` objects.
- **The toggle check's fallback** is the dev server with a dynamic `import()` when driving the Audio Rig UI is impractical.
- **The "pre normal, master silent" branch** is proven by unit tests only; the real-browser forced silence exercises "both silent".
- **Existing test files gain mocks** (`globalFx` in `audioDiagnostics.test.ts`; `Analyser` in `globalFx.test.ts`); no existing case changes.
- **Open questions resolved (Crawford, 2026-09-21):** −80 dBFS / 3 s thresholds; underrun burst events with a running total; red on underruns; the robot-volume-0 false positive accepted and documented.

## Open Questions

None blocking. For Crawford:
- ~~Phone build after Checkpoint A or B?~~ **Answered 2026-09-21: the phone build can wait until the end.**
- ~~What Chrome version is on the Pixel?~~ **Answered 2026-09-21: Chrome 153** — `playbackStats` (shipped in 146) will be there, and desktop Chrome 153 was probed with it present.

## Task results

*(Filled in as tasks complete: Tasks 6, 9 and 13's real-browser readings; the Task 16 phone run.)*

### Task 1 — the probe (2026-09-21, headless Chrome 153.0.0.0 on Windows, 48 kHz; a throwaway CDP script in real time, never committed; Chrome process count 43 before and 43 after)

A page builds `Oscillator(440 Hz) → Gain(0.5) → destination`, plus a native `AnalyserNode` (`fftSize` 32768) fed from the gain and connected to **nothing**.

| Step | Peak read from the analyser | Meaning |
|---|---|---|
| A. running, 2 s | **0.49999994** | An analyser with no output connection **is processed** (spec assumption 3 holds). |
| B. `gain.gain = 0`, 1.5 s | 0 | Real silence flowing in reads as 0 (a processed analyser sees silence). |
| C. `gain.gain = 0.5`, 1.5 s | 0.49999967 | Back to the signal. |
| D. `gain.disconnect()`, 2 s (> the 0.68 s buffer) | **0** | After a rewire drops the tap, the analyser reads **silence, not a stale buffer** — so a dropped tap would raise a *false silent event*, which is why Task 4's hook matters. |
| E. reconnected, 1.5 s | 0.49999958 | Reconnecting restores it. |

`AudioContext.playbackStats` on the same context: `totalDuration` 1.013 → 4.012 over 3.004 s of wall time, so **the units are seconds**; `averageLatency` 0.0434 → 0.0438 (≈ 43 ms) against `baseLatency` 0.010 and `outputLatency` 0.040; `minimumLatency` 0, `maximumLatency` 0.0451; `underrunEvents` 0 and `underrunDuration` 0 in this calm run.

### Task 13 — real browser, slice C (2026-09-21, production build and `vite` dev server of `f6dd863`, headless Chrome 153, `?debug&seed=charlie&x=200&y=-30`; Chrome process count 43 before and 43 after each production run) — **one criterion MISSED; stopped at the gate for Crawford's decision**

**Met — mute and toggle raise nothing (production build).** A 12 s mute: `out` `-inf`, `pre` live (−6.7 dB), **no event and never red**. Unmute, then Controlled and Natural Decay for 8 s each: no event, never red, the whole event log empty. No console errors.

**Forced silence (dev server).** From the page: `import()` of `globalFx`, `getGlobalChainEntry().disconnect()` (EQ3 no longer feeds the chain), then `attachOutputTaps()` so the hook reconnects EQ3 to the pre-chain tap — pre stays live, everything after EQ3 is silent, notes keep being scheduled.
- **Run 1:** `out` fell −13 → −116 → −229 → … → `-inf` (the reverb and delay tails rang out for ≈ 1.7 s), `pre` stayed live (−5 … −15 dB). About **6.5–7 s after the cut** the overlay went red and logged `0:23 master output silent for 3s while notes sound (pre-chain normal)`. After `wireGlobalFxChain(false)` the level returned within 1 s, the border cleared and `0:26 master output audible again after 6.0s` was logged. So the event's wording, the pre-chain reading, the red status and the recovery all work.
- **Run 2 (same steps, `voices` logged each second):** **no event within 9 s.** `voices` read 4, 3, **0**, 6, 5, **0**, 7, 7, 3 — notes in flight fell to 0 twice, and each time the 3 s count restarted, because `expectSound` requires `voices > 0` at *every* sample.

**Criterion "raises the silent event within about 3.5 s of the disconnect": MISSED** — ≈ 6.5–7 s in one run, not within 9 s in the other. Two causes. (1) The FX tails keep the master above −80 dBFS for ≈ 1.7 s after a cut — a property of this test, not a defect. (2) **The real finding: the instantaneous `voices > 0` term lets any gap between notes restart the count.** With 3–4 robots sounding (this run: `audible 3/12`) gaps are frequent; on the phone's `bravo` runs (7–8 sounding) `poly` was never 0 in about 25 transcribed screenshots, but the same fragility applies whenever few robots sound. This is spec §7's own risk ("missed silence between notes"), now measured. Nothing was tuned; the options went to Crawford.

**Resolution (Crawford chose option 1, 2026-09-21): gaps between notes now pause the count instead of restarting it** (commit `03f85ec`, test first, eight mutants killed). `expectSound` no longer includes `voices > 0`; a separate `notesSounding` does, and a gap adds nothing to the count and does not restart it (muting, a stopped transport, a suspended context and an audible master still do). Re-run on the dev server, same forced silence, **three times: the event fired every time**, 8, 5 and 6 uptime seconds after the cut (±1 s), each `(pre-chain normal)`; the overlay went red and cleared on restore each time, with the recovery logged (`audible again after 7.4s / 7.5s / 7.0s`). Those latencies are the FX tail-out (≈ 2 s here) plus 3 s of counted silence plus any note gaps; the run with two zero-`voices` samples took longest. **The criterion is revised accordingly** (it assumed instant silence and no note gaps). Checkpoint C full suite afterwards: 152 files, 3316 tests, all green.

### Task 9 — real browser, slice B (2026-09-21, production build of `03f0cd0`, headless Chrome 153, `?debug&seed=charlie&x=200&y=-30`, 90 s; Chrome process count not higher afterwards)

**A second real-browser finding: the first run read `underruns n/a` for the whole 90 s.** Tone's `rawContext` is a `standardized-audio-context` wrapper, not the browser's own `AudioContext`, and it does not forward `playbackStats` (Task 1's probe used a native context, which is why it saw the API). The native context sits in the wrapper's TypeScript-private `_nativeAudioContext` (and `_nativeContext`). **Correction (commit `03f0cd0`, test first, five mutants killed):** `readPlaybackStats` looks on the context itself first, then on those fields, skipping any holder that throws or whose `playbackStats` is not an object; `n/a` remains the fallback. Reading a private field of a dependency is fragile — a `standardized-audio-context` upgrade could quietly return the overlay to `n/a` — which is why every step is defensive and the line says `n/a` rather than showing zeros. To be listed under As Shipped (Task 15).

Corrected run: 18 readings, 5 s apart, all `underruns 0 (0ms) · lat 44ms (0-47)`, with `out` −12 … −17 dB alongside; no events, never red, no console errors. **A calm desktop run therefore shows 0 underruns in 90 s and an average output latency of 44 ms (min 0, max 47)** — the baseline to hold the phone against. No underrun burst was provoked on desktop; the burst logic stays covered by Task 7's unit tests and the phone provides the real thing (the robot-LFO stress recipe in `docs/PERFORMANCE.md` could provoke one, if wanted).

**Checkpoint B full suite:** 152 files, 3272 tests, one intermittent failure — `CompanyCrudControls › Rename Submit button › is (normally) enabled immediately after selecting a company…`, the second test on backlog #29's list; 45/45 in three isolated runs.

### Task 6 — real browser, slice A (2026-09-21, production build, headless Chrome 153, `?debug&seed=charlie&x=200&y=-30`; Chrome process count 43 before and 43 after)

**The first run failed, and that is the finding.** On the build of `1b12ab4` (taps made with `Tone.Analyser`) the overlay read `out - rms -  pre -  fin -` after 10 s — neither tap produced a reading. Cause, from Tone's source (`node_modules/tone/build/esm/component/analysis/Analyser.js`): `Tone.Analyser` sets `fftSize = 2 × size` and caps `size` at 16384, so the requested 32768 asked the browser for an `fftSize` of 65536, which it rejects; the error was caught and warned (dev-only) and the mocked unit tests could not see it. Even at Tone's maximum it fills its size-long buffer from only the older half of the `fftSize` window, leaving unseen gaps between 500 ms samples.

**Correction (commit `551408d`, test first, seven mutants killed):** the taps are native `AnalyserNode`s made from Tone's raw context, `fftSize` = `OUTPUT_TAP_SIZE` = 32768, with a same-length buffer allocated once and reused — the configuration Task 1 probed. This **deviates from the spec's "Tone `Analyser`"** (§1, §4) and Task 3's description above; it is recorded for the As Shipped section (Task 15). The unit-test mock now enforces the real `fftSize` limit, so this class of bug fails in the unit tests too.

Second run, on the corrected build (a first attempt at the unmute step failed only because the toggle's accessible name does not change — the same "Mute" toggle unmutes; a driver slip, not an app fault):

| Step | `out` (master peak · rms) | `pre` (pre-chain peak) | Overlay |
|---|---|---|---|
| running, 4–10 s | −13.8 … −16.9 dB · −23.2 … −24.1 dB | −7.6 … −12.8 dB | `fin ok`, not red |
| **muted**, 4 s and 10 s | **−inf · −inf** | −7.4 dB, −10.2 dB (**still live**) | `fin ok`, not red |
| unmuted, 4 s | −15.0 dB · −23.9 dB | −11.5 dB | `fin ok` |
| Controlled Decay, 4 s | −15.2 dB · −24.4 dB | −9.9 dB | `fin ok` |
| Natural Decay, 4 s | −12.9 dB · −23.5 dB | −4.4 dB | `fin ok` |

Levels were live within ~2 s of power-on. **Muting silences `out` while `pre` stays live — the two-tap discrimination, seen for real** — and both taps survive the Natural ↔ Controlled Decay toggle in both directions (the re-attach hook working in the production bundle). No non-finite flags, no console errors.

**Checkpoint A full suite:** 152 files, 3235 tests (3191 before this work), one intermittent failure — `src/systems/idleSystem.test.ts › pickDestination › generates destinations in center area (not just edges)`, a statistical assertion (at least 20 of 100 random destinations in the centre) in code this work does not touch. It passed 17/17 in five isolated runs, and it is not in backlog #29. Noticed, not touched.
