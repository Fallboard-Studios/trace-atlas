# Phase Spec: Audio Output Diagnostic (`?debug` master-output level + playback stats)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (one file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Phone preview over the LAN: `npm run build && npx vite preview --host --port 4173`, then on the phone `http://<pc-ip>:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=full` (`ipconfig` for the address)

**Status:** Draft v2 — approved by Crawford 2026-09-21 (the four open questions resolved as proposed, §7); plan and tasks in [docs/tasks/AUDIO_OUTPUT_DIAGNOSTIC.md](../tasks/AUDIO_OUTPUT_DIAGNOSTIC.md); nothing built. Written 2026-09-21 on branch `bugs/scratchy-audio-phones`. Approved in principle by Crawford as decision **P** in [AUDIO_LOAD_BUDGET.md §7](AUDIO_LOAD_BUDGET.md#decisions-resolved-2026-09-20-crawford) (the full version, including a second tap before the FX chain and a hook so taps survive the Natural/Controlled Decay toggle). Roadmap: a follow-up to 17.2.6, not a new phase.

---

## 0. Assumptions (correct these now or I proceed with them)

1. **Diagnostic only.** Nothing here changes what is heard or how any setting behaves. The only consumer is the existing `?debug` overlay, and with `?debug` absent nothing new is constructed.
2. **The master tap sits after `masterGain`,** so it reads what the destination receives (limiter and volume/mute included).
3. **An `AnalyserNode` with no output connection is still processed in Chrome** (Web Audio's "automatic pull" handling). This is *unverified* and is checked first (§5.3, criterion 9); if it fails, the taps must be given a silent sink instead.
4. **"Notes in flight" (`AudioEngine.getPolyphonyStats().voices`, the overlay's `voices n/16`) is a fair "expect sound" signal.** Known false positive: a sounding robot whose own volume is 0 produces genuine silence with `voices > 0`. Accepted for a debug tool and documented in §7.
5. **`AudioContext.playbackStats` is the current name of the browser's playback-quality API,** and the Pixel's Chrome has it (shipped in Chrome 146 on Android per the Intent to Ship). The Pixel's Chrome version is *not* known; if the API is missing the overlay says `n/a` and everything else still works.
6. **The one production-path touch is a re-attach hook at the end of `wireGlobalFxChain`,** which is a no-op unless the taps were requested. No other existing behaviour is modified.

---

## 1. Overview & Claude Explanation

**The problem.** On the Pixel 8 the audio clicks and, on the heavy world (`bravo`), drops out completely for seconds to minutes. Three of those full dropouts — `bravo` Standard (~4:55), and two `bravo` Full takes on a rested, unplugged phone playing through its own speaker — left **every** reading in the `?debug` overlay normal: `ctx running`, the audio clock at x0.98–1.06, `sounding` 5–8, `poly` 4–13/16 (notes being scheduled), no logged event ([todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md)). Heat, charging and Bluetooth do not explain them. What the overlay measures is therefore not what is failing.

**The question this answers.** When it goes silent, is the sound **silent inside the graph** (something between the voices and the destination produces nothing or a non-finite value) or **lost after the graph** (the browser hands normal audio to the device output and the device drops it)? Those lead to opposite fixes: the first is ours to find in the FX chain or the voices; the second is not fixable from the app.

**What we add, all under `?debug` only:**

1. **Two read-only level taps** (Tone `Analyser`, waveform mode): a **master** tap after `masterGain` (what the destination gets) and a **pre-chain** tap after the first FX node, EQ3 (what the voices deliver to the chain). Each yields peak, RMS and a finite check per sample.
2. **A silent-while-sounding event and a red status:** the master peak stays below −80 dBFS for 3 s or more while notes are sounding, the master volume is above 0, the transport is started and the context is `running`. The event text says whether the pre-chain tap was still normal at that moment.
3. **A non-finite event** (NaN/Inf in either tap), also turning the overlay red.
4. **`AudioContext.playbackStats`:** the browser's own count of playback underruns and its latency figures, shown in a line and logged as edge events. This is the direct device-side glitch count the project has lacked ("the overlay cannot count glitches directly"). It also tests whether the *clicks* are underruns.
5. **A tap-survival hook.** `wireGlobalFxChain` calls `node.disconnect()` on every FX node whenever the Natural/Controlled Decay toggle flips ([`globalFx.ts`](../../src/engine/audioEngine/globalFx.ts) `disconnectAllFxNodes`), which would silently detach any tap and cause a false "silent" event. The hook re-attaches the taps at the end of `wireGlobalFxChain`.

**How to read it** (the decision table this exists to fill in):

| Master tap | Pre-chain tap | Playback stats | Reading |
|---|---|---|---|
| ≈ silent, `voices > 0` | normal | — | The fault is **inside** LPF → HPF → Delay → Reverb → Compressor → Limiter → master. Look there first. |
| ≈ silent | ≈ silent | — | **Upstream:** the voices or EQ3 produce nothing although notes are scheduled. |
| normal | normal | `underrunEvents` rising | The graph is fine and the output **underran**: load or scheduling, not a silent node. Clicks are underruns. |
| normal | normal | flat | The graph is fine and the browser reports no underrun: loss is **downstream** (OS/device), not visible to the app. |
| any | any | absent (`n/a`) | Levels still answer graph-vs-not; underruns need Chrome ≥ 146. |
| non-finite | either | — | A NaN/Inf is latched; the tap that first shows it locates it. |

**What this does not do.** It does not fix the dropouts, change the Audio Load presets, or add any behaviour. It cannot see the Android output stream itself, so "downstream" is by exclusion. It puts two analyser nodes on the graph of the device where a graph-level fault is suspected (an observer effect, cheap and debug-only — see §7).

**Correction this spec carries.** Earlier docs say the stats API is "absent in Chrome 153 desktop". That check used the **old name** `playoutStats`. On 2026-09-21 a headless Chrome 153 probe found `AudioContext.playbackStats` **present** (`averageLatency`, `maximumLatency`, `minimumLatency`, `resetLatency`, `toJSON`, `totalDuration`, `underrunDuration`, `underrunEvents`), and `playoutStats` and `renderCapacity` absent. Those two doc lines are corrected as part of this work (§6).

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── audioHealth.ts              MODIFIED  pure: measureLevel, dB helper, silent / non-finite / underrun edge events in stepDiag
│   └── audioHealth.test.ts         MODIFIED  new cases only; existing cases untouched
├── engine/
│   ├── audioDiagnostics.ts         MODIFIED  starts/stops the taps with the sampler; reads levels + playbackStats each tick
│   ├── audioDiagnostics.test.ts    MODIFIED  new cases only
│   └── audioEngine/
│       ├── globalFx.ts             MODIFIED  attachOutputTaps / detachOutputTaps / readOutputTaps; re-attach hook at the end of wireGlobalFxChain
│       └── globalFx.test.ts        MODIFIED  Tone mock gains Analyser; new cases only
└── components/debug/
    ├── hudLines.ts                 MODIFIED  ≤ 2 new lines; hudStatus 'bad' on silent / non-finite / underrunning
    └── hudLines.test.ts            MODIFIED  new cases only
docs/
├── PERFORMANCE.md                  MODIFIED  overlay section: the new lines, the reading table
├── AUDIO_SYSTEM.md                 MODIFIED  "Debug Tools": one line pointing at the diagnostic
└── todo/scratchy-audio-phones.md   MODIFIED  the two `playoutStats` claims get a dated correction note
```

Unchanged on purpose: `AudioEngine.ts` (diagnostics imports `globalFx` directly, as `audioStore.ts` already does), `AudioDebugHud.tsx` (it already renders whatever `buildHudLines` returns), `AudioDebugHud.css`.

---

## 3. Implementation Boundaries & Constraints

* **Strict scope:** touch only the files above. No change to voices, the FX chain's topology, the LFO or budget systems, or any stored value.
* **Read-only, `?debug`-only.** Taps are created when `startAudioDiagnostics()` first runs (ref-counted, as today) and disposed when the last stop handle is called. With `?debug` absent, `buildGlobalFxChain` and `wireGlobalFxChain` construct **zero** analysers.
* **Taps never connect to the destination or to any other node,** and the code never modifies a gain, never calls `playbackStats.resetLatency()`, and never writes to the audio graph beyond adding/removing its own tap connections.
* **CLAUDE.md guardrails hold:** the analysers are constructed in `src/engine/audioEngine/globalFx.ts` (engine code), never in a component; they live in module scope, never in Zustand; the 500 ms sampler remains a diagnostic cadence, not musical timing (same precedent as today); no GSAP timeline touches the engine.
* **The tap survives rewiring.** Taps must be re-attached after every `wireGlobalFxChain` run and must work in either order — overlay started before the chain exists (page load, before first power-on) or after.
* **A muted master is not a silence.** `getMasterVolume() === 0` (or transport not `started`, context not `running`, or `voices === 0`) suppresses the silent event.
* **Ask first (per CLAUDE.md, and per this spec):** any tap on a voice bus or any node other than EQ3-out and masterGain-out; changing `SAMPLE_INTERVAL_MS`; making any of this active without `?debug`; adding a dependency; any change to production wiring beyond the one re-attach hook.
* **Never:** persist diagnostics, add a dependency, disable or delete an existing test, push, or open a PR without Crawford asking.

---

## 4. Code Style & Architecture Conventions

Pure decisions in `audioHealth.ts` (no Tone/DOM), the runtime shell in `audioDiagnostics.ts`, the Tone nodes in `globalFx.ts` — the split the current diagnostics already use.

```typescript
// src/utils/audioHealth.ts — new, pure
/** Master peak (linear) below which the output counts as silent: −80 dBFS. */
export const SILENT_PEAK_THRESHOLD = 1e-4;
/** How long the master must stay silent, while notes sound, before it is logged. */
export const SILENT_EVENT_AFTER_MS = 3000;

export interface LevelReading {
  peak: number;        // max |x| over finite samples, linear
  rms: number;         // over finite samples
  nonFinite: number;   // count of NaN / ±Infinity samples
}

/** null for an empty buffer; NaN/Inf never poison peak or rms. */
export function measureLevel(samples: ArrayLike<number>): LevelReading | null { /* … */ }

export function peakToDb(peak: number): number { return peak > 0 ? 20 * Math.log10(peak) : -Infinity; }
```

```typescript
// src/engine/audioEngine/globalFx.ts — new, engine-side
/** One buffer must cover a whole sampler interval or a quiet gap between samples goes unseen:
 *  32768 samples ≈ 0.68 s at 48 kHz (0.74 s at 44.1 kHz) vs SAMPLE_INTERVAL_MS = 500. */
export const OUTPUT_TAP_SIZE = 32768;

export function attachOutputTaps(): void { /* set wanted; build + connect analysers if EQ3 and masterGain exist */ }
export function detachOutputTaps(): void { /* clear wanted; disconnect + dispose */ }
export function readOutputTaps(): { pre: Float32Array | null; master: Float32Array | null } { /* … */ }
```

* **Naming and layout:** camelCase functions, `SCREAMING_SNAKE` constants with a one-line reason each, sections in the existing `// ====` banner style, named exports, co-located tests, `devWarn` (not `console`) for guarded failures, every Tone construction guarded the way `buildGlobalFxChain` guards its own.
* **Optional new fields:** the new `DiagSample` fields are **optional** and `initDiagState` supplies defaults, so every existing `audioHealth`/`audioDiagnostics`/`hudLines` test passes unmodified.
* **Overlay budget:** at most **two** new HUD lines, each ≤ 52 characters (the current longest, the budget line, is 54 and already fits a 390 px phone), for example `out -12.3dB rms -20.1  pre -13.0  finite ok` and `underruns 3 (12ms) · lat 21ms (20-34)`. Unknown values print `-`; an absent API prints `underruns n/a`.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location
Vitest; tests co-located (`audioHealth.test.ts`, `audioDiagnostics.test.ts`, `globalFx.test.ts`, `hudLines.test.ts`). Test first: each behaviour below is written as a failing test and seen to fail for the right reason before the code.

### 5.2 New tests
* **`measureLevel` / `peakToDb`:** silence (peak 0, `-Infinity`), a known sine (peak = amplitude, RMS = amplitude/√2 within tolerance), one NaN and one ±Infinity among finite samples (counted, peak/RMS unaffected), all non-finite, empty input (`null`), single sample.
* **`stepDiag` — silent-while-sounding:** no event before 3 s of continuous silent+expected samples; one event at 3 s naming the pre-chain state (`normal` / `silent`); no second event while it continues; one recovery event with the duration; **not** raised when `voices = 0`, master volume 0, transport not started, or context not `running`; a break in the condition resets the timer. Non-finite: one event per tap on entry and one on exit.
* **`stepDiag` — underruns:** count unchanged → nothing; increase → one "began" event; more increases while active → still one; quiet for ≥ 1 s → one "stopped" event with the total added; API absent (`null`) → no events, no throw.
* **`globalFx` taps:** construction of analysers only after `attachOutputTaps()`; **zero** analysers after `buildGlobalFxChain()` alone and after `wireGlobalFxChain(true)`; attach-before-build and build-before-attach both end connected (EQ3-out → pre, masterGain-out → master); **`wireGlobalFxChain(true)` then `(false)` leaves both taps connected** (this is the test the hook exists for); `detachOutputTaps()` disconnects and disposes; everything is a no-op with the FX nodes null (headless); a failing `connect` is caught and warned, never thrown.
* **`OUTPUT_TAP_SIZE` relationship:** `OUTPUT_TAP_SIZE / 44100 * 1000 ≥ SAMPLE_INTERVAL_MS`.
* **`audioDiagnostics`:** the sampler passes levels, `expectSound` (voices > 0, master volume > 0, transport started, context running) and playback stats into `stepDiag`; reads `playbackStats` defensively (absent, throws, non-numeric) and never calls `resetLatency`; starting attaches the taps and the last stop detaches them.
* **`hudLines`:** the two lines format levels in dB with `-` for unknown; `underruns n/a` when absent; `hudStatus` is `'bad'` while silent-while-sounding, non-finite, or underrunning, and unchanged otherwise.
* **Mutation checks (each must be seen to fail):** remove the re-attach hook → the toggle test fails; drop the `voices > 0` term → the not-raised test fails; drop the master-volume guard → the mute test fails; change `SILENT_EVENT_AFTER_MS` semantics (`>=` vs `>`) → the boundary test fails; construct analysers in `buildGlobalFxChain` → the zero-analysers test fails.

### 5.3 Success criteria
1. **No cost without `?debug` (deterministic).** With diagnostics never started, no analyser is constructed by `buildGlobalFxChain`, `wireGlobalFxChain(false)` or `wireGlobalFxChain(true)`, and the **whole existing suite passes with no existing test case or assertion altered** (152 files / 3191 tests before this work; adding a mock or setup to a test file so it can import a changed module is allowed).
2. **Order-independent (deterministic).** Taps are connected whether the overlay started before or after the chain was built.
3. **Survives the toggle (deterministic).** Both taps stay connected across `wireGlobalFxChain(true)` and `(false)`; removing the hook makes the test fail.
4. **Level math (deterministic)** as in §5.2, including NaN/Inf handling and the empty buffer.
5. **Silent event (deterministic):** fires only after ≥ 3 s of continuous silence with notes sounding, master volume > 0, transport started, context running; once on entry and once on exit; names the pre-chain state.
6. **Non-finite (deterministic):** one entry and one exit event per tap; overlay red while present.
7. **Playback stats (deterministic):** absent → `n/a`, no events, no error; present → totals and latency formatted; one "began" / one "stopped" event per underrun burst; the sampler never calls `resetLatency`.
8. **Overlay fits:** at most two new lines, each ≤ 52 characters; existing line formats unchanged.
9. **Real browser (headless Chrome 153, production build, `?debug`, pinned world).** After power-on: master and pre levels are finite and above −80 dBFS while robots sound (proves the unconnected analysers are processed, assumption 3); the `underruns` line renders with real numbers (`playbackStats` present); toggling Natural/Controlled Decay in the Audio Rig leaves the levels live and raises **no** silent event; muting the master raises **no** silent event; no console errors; Chrome process count identical before and after.
10. **Docs (§6)** updated, including the two `playoutStats` corrections.
11. **Gates clean:** `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all pass.
12. **The phone check is Crawford's and is recorded, not gated:** on the Pixel, `?debug&seed=bravo&x=-150&y=90&load=full` (and any other run he chooses), read the new lines at a dropout and file them in [todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md). Whatever they show — including `n/a` — is a finding.

### 5.4 Verification order
`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → the real-browser check (criterion 9, foreground, one call at a time, process count before and after) → hand to Crawford with the LAN-preview commands.

---

## 6. Documentation & Git/Workflow Context

* **Docs to update:** `docs/PERFORMANCE.md` (the `?debug` overlay section: the two new lines, the reading table from §1, the underrun semantics as actually observed); `docs/AUDIO_SYSTEM.md` "Debug Tools" (one line + link); `docs/todo/scratchy-audio-phones.md` (a dated correction note beside the two `playoutStats` / `renderCapacity` claims — **append a note, do not rewrite the history**); `docs/todo/roadmap.md` 17.2.6 (one sentence). Every path and constant named in the docs is checked against the code first.
* **Branch:** `bugs/scratchy-audio-phones` (39 commits ahead of `main` at the time of writing, unpushed). No push, no PR unless Crawford says so.
* **Commits:** one per task, tests with their code, message ending with the session's Co-Authored-By line; the spec itself is committed first, on its own.
* **Process:** this spec → Crawford's review → plan and task list (`docs/tasks/AUDIO_OUTPUT_DIAGNOSTIC.md`, the repo's convention, not the skill's `tasks/` default) → test-driven, one task per commit, mutation-checked, stopping to report at the criterion-9 gate. Follows `tdd-incremental-workflow`.
* **`CLAUDE.md`'s reference list** is not extended by this spec. Whether to mention the Audio Load Budget in its `AUDIO_SYSTEM.md` line is a separate call for Crawford (none of the per-feature specs under `docs/specs/` is listed there today).

---

## 7. Open Questions & Risks

### Open questions — all four resolved 2026-09-21 (Crawford accepted the proposals as written)

1. **Thresholds.** Silent = master peak below **−80 dBFS** for **3 s**. Both are constants; tighter/looser? (Every observed dropout was seconds to minutes, so 3 s should lose nothing.)
2. **Underrun logging.** Proposed: one "began" and one "stopped" edge event per burst (quiet ≥ 1 s ends a burst), plus the running total in the line, so a click storm cannot flush the 8-line log. Alternative: the line only, no events.
3. **Red on underruns.** Proposed: the border is red while underruns are occurring (so red lines up with clicks). Alternative: red only for silence and non-finite.
4. **The volume-0 false positive** (a sounding robot whose own volume is 0 reads as silent-while-sounding): accept and document (proposed), or add a term for "robot volumes are all 0"?

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| An unconnected `AnalyserNode` is not processed on some browser | Levels read 0 and a false silent event fires | Criterion 9 verifies it on Chrome 153 first; fallback is a silent sink (`Gain(0)` to destination) — an "ask first" change |
| The tap is dropped by a re-wire other than the toggle | False silent event | Re-attach runs at the end of every `wireGlobalFxChain`; the pre-chain state in the event text and the raw levels on the overlay line let a screenshot expose a dead tap |
| Observer effect: two analysers on the suspect graph | Could nudge the load being measured | Debug-only; analysers copy into a ring buffer and are read every 500 ms; the change is in the criterion-12 notes when Crawford compares |
| `voices > 0` is a coarse "expect sound" | Missed silence between notes; false positive at robot volume 0 | Stated in §0.4; raw levels stay on the line for interpretation |
| `playbackStats` semantics differ from assumption (units, what counts as an underrun) | Misread numbers | Read the spec section for the exact definitions before coding the lines; record the observed behaviour in `PERFORMANCE.md`; treat units as seconds only after the headless check |
| The Pixel's Chrome predates 146 | `n/a` on the phone | Handled (§4); the level taps still answer the graph-vs-not question |

### Not in scope
Any fix for the dropouts; lazy voice chains (Phase B); changes to the Audio Load presets or LFO caps; persistence; a per-voice tap; a Web Audio panel replacement.
