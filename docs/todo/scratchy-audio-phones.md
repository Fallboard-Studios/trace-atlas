# Scratchy / Cutting-Out Audio on Phones — Investigation State

Opened 2026-09-18 on branch `bugs/scratchy-audio-phones` (cut from `main` after PR #484 merged roadmap 17.2.1/17.2.2). **Status (2026-09-21): the diagnostics (`?debug`, `?latency=`, `?x=`/`?y=`, `npm run perf:audio`) and the Audio Load Budget ([roadmap 17.2.6](roadmap.md#1726-performance-audio-load-budget)) are implemented and committed on this branch; the phone check is pending — see the last section.** The rest of this file is the investigation history and handoff, kept as written. Related: [17.2.4](roadmap.md#1724-performance-audio-scheduling-headroom-tone-lookahead) (Tone `lookAhead`), [17.2.5](roadmap.md#1725-performance-idle-paint--composite-cost), [PERFORMANCE.md](../PERFORMANCE.md).

## The report

Crawford, on a **Pixel 8, incognito Chrome**, after 17.2.2 went live (`main`): visual loading is much better, but **audio is very scratchy and often cuts out completely for 10–20 seconds**. Not yet known: whether it happens at idle or while interacting, and whether the visuals keep animating during a dropout.

## What was measured (desktop, headless Chrome 153, production build)

- **The audio render thread is steady at ~25–30% of one core** just to play, with no interaction. Chrome's own DevTools data agrees: render capacity mean **0.28**, max 0.50; callback interval **10.000 ms**, std-dev 0.06 ms; callback buffer 480 frames (10 ms @ 48 kHz). Held for 60 s at 1× and at 6× main-thread throttle (which doesn't touch the audio thread). p99 render time ~1.4 ms vs a 2.67 ms budget per 128-frame quantum; ~0 quanta over budget.
- **No audio errors or exceptions** in 60 s at either throttle. The only console output is benign `[IdleSystem] Robot … not found or not Idle/Active (state: idle, docking: docked)` warnings (~10 per run).
- **The graph is large: ~1,400 nodes at startup, ~1,000 processed per render quantum** (about 411 `Gain`, 12 oscillator, 10 biquad, a `Convolver`, a `DynamicsCompressor`, plus ~260 always-running `ConstantSource`s). ~1–2 µs per node per quantum.
- **Where the nodes come from** (creation-stack attribution on an unminified build): almost all from `spawnRobot` → `spawnInitialRoster` — every one of the 12 robots gets a full `Tone.Synth` (`OmniOscillator` + `AmplitudeEnvelope` + `Volume`), several `Tone.Filter`s, and per-layer gains at spawn, even though only 2–4 start active (`INITIAL_ACTIVE_ROBOTS_MIN/MAX`, `src/constants/index.ts`). The `ConstantSource`s are Tone `Signal`/`Param` internals (oscillator frequency/detune, filter params, envelopes): they start at construction and never stop, so they render every quantum forever. Global FX (`EQ3`/`MultibandSplit`, etc.) and a few LFOs (~10–14) are a small share.
- **The reverb is not the driver.** Ablation (a scratch build with no reverb): only 2–7 percentage points. Decay is seeded 0.5–4 s (`globalAudioLoadingRanges.ts`).
- **Steady cost scales weakly with robot count** when quiet: 12 robots ≈ 24%, 3 robots ≈ 16–20% (3 interleaved rounds, same seed).
- The Tone context uses **defaults**: `latencyHint: "interactive"`, `lookAhead: 0.1` (100 ms). Nothing in `src/` sets `Tone.setContext`, and nothing calls `resume()`/`suspend()` or listens for `statechange` — **a suspended AudioContext would never be resumed by the app.**

## What is NOT known (do not assert these)

- **Whether the phone's audio thread is overloaded.** ~25–30% of a desktop core is thin headroom for a phone, but it is not proof of overload; the phone's per-core speed, core placement, and thermal state are unmeasured.
- **What causes 10–20 s total dropouts.** Buffer underruns give short crackles, not long silences. Candidates, none confirmed: the AudioContext being suspended/interrupted and never resumed; a long main-thread stall starving the scheduler; thermal throttling (the app also keeps the main thread ~84% busy at idle at 4× — 17.2.5).
- Chrome Android's low-latency (`interactive`) path is known to glitch on complex graphs, and `latencyHint: "playback"` is the usual mitigation — **unverified for this app on this phone.**

## Retracted earlier claims (so nobody re-derives them)

- "Load depends on the world seed" — **retraction is itself unproven (corrected 2026-09-19).** Single runs of the same `?seed=` gave 72% and 29% (and 55% vs 34%) and were written off as measurement noise. But `?seed=` only pinned the Attenuation Style (global FX chain); the default locale's **coordinates were still random per load**, so those runs had different robots/BPM/day phase and were **not the same world**. The swings may have been noise, or genuinely different worlds — the data can't say. Interleaved, repeated runs at ~24% only show robot count has a weak effect. Re-tested with the world fully pinned (`?seed=<word>&x=<int>&y=<int>`, added 2026-09-19 — see [PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md)): **the world does matter** — see "Pinned-world measurement" at the end of this file.
- Single-run comparisons of any audio-load number are unreliable here. Use ≥3 interleaved rounds, and see the hygiene rules in the memory note `perf-harness-measurement-hygiene`.

## How to measure (this recipe is now `npm run perf:audio` — see [PERFORMANCE.md](../PERFORMANCE.md); the original steps are kept below)

All drive headless Chrome over CDP (Node 24 built-in `WebSocket`, no dependency), load `vite preview` of a production build, click `button[aria-label="Power on"]`, wait ~8 s. `?seed=<word>&x=<int>&y=<int>` pins the otherwise-random world. **`?seed=` alone does not** — it fixes the Attenuation Style (global FX chain) but the locale coordinates, and so the robots, BPM and day phase, stay random per load. Pin both for any A/B.

1. **Render-thread time per quantum** — `Tracing.start` with `includedCategories: ['webaudio','audio']`; sum `dur` of `RealtimeAudioDestinationHandler::Render` events (thread `AudioOutputDevice`). Budget = 128/48000 s = 2.67 ms. This is light. Adding `disabled-by-default-webaudio.audionode` gives per-handler timings (`GainHandler::Process`, `OscillatorHandler::Process`, `ConvolverHandler::Process`, …) but **the tracing itself inflates load ~3×** — use it only for the relative breakdown.
2. **DevTools "Web Audio" panel data** — `WebAudio.enable`, capture `WebAudio.contextCreated` (the `realtime` one), then **poll** `WebAudio.getRealtimeData({contextId})` every ~500 ms (`contextRealtimeDataChanged` events do not arrive on their own). Fields: `renderCapacity` (0–1), `callbackIntervalMean`, `callbackIntervalVariance` (seconds).
3. **Node counts by creator** — inject via `Page.addScriptToEvaluateOnNewDocument` a Proxy over each `AudioNode` subclass constructor plus a wrapper over every `BaseAudioContext.prototype.create*`, recording `new Error().stack` (set `Error.stackTraceLimit = 40`); aggregate by the first non-plumbing frames on an **unminified** build (`npx vite build --minify false --outDir <tmp>`).
4. `AudioContext.renderCapacity` (the JS API) is **not available** in Chrome 153 desktop, even with `--enable-experimental-web-platform-features`. *[Correction 2026-09-21: `renderCapacity` is indeed absent, but the glitch-counting API exists under its current name, `AudioContext.playbackStats` (Chrome 146+; present in headless Chrome 153) — see [PERFORMANCE.md](../PERFORMANCE.md#reading-the-output-taps-and-the-playback-stats).]*

## What to do next

**Step 1 — get real data from the phone (Crawford, USB):** enable USB debugging on the Pixel → desktop `chrome://inspect` → inspect the app tab → DevTools ⋮ → More tools → **WebAudio** → select the context and read, *while it is scratchy or cut out*: **render capacity** (desktop is ~0.3; near/above 1.0 means the audio thread is overloaded), callback interval mean/variance, callback buffer size, and **context state** (`running` vs `suspended`). Also note: do the visuals keep animating during a dropout (→ audio thread/context) or freeze too (→ main-thread stall)? Does it happen at idle or only while interacting? After how long?

**Step 2 — pick by what Step 1 shows.** Every option below touches the audio system, so `CLAUDE.md` requires asking Crawford first.

| If the phone shows… | Do | Notes |
|---|---|---|
| State goes `suspended`/`interrupted` | Listen for `statechange` on the raw context and resume when the engine should be running (small, TDD-able) | The app currently never resumes. |
| Render capacity high, or crackles with a healthy state | Opt-in `?latency=playback` first (default unchanged) so Crawford can A/B on the phone in one deploy; if it helps, make it the default | Overlaps roadmap **17.2.4**, which Crawford had held to keep profiling data clean; the symptom now justifies it. Must be set before any Tone node is constructed. |
| Render capacity high even with `playback` | Build each robot's voice chain only while it is audible/active (and dispose or pool otherwise) | Real design change; could cut most of the ~1,000 nodes (docked robots' chains are always-on today). Needs a spec. |
| Visuals freeze during dropouts | Main-thread stall — 17.2.3/17.2.5 territory; also check for a long task in a Performance trace | The 17.2.2 fix removed the tile-open stalls; idle paint cost is still ~84% busy at 4×. |
| Device hot / throttling | 17.2.5 (idle paint & composite cost) — heat throttles the audio thread too | |

If USB debugging is impractical, an **in-app `?debug` readout** (context state, `baseLatency`/`outputLatency`, `statechange` log) would give the same first-order signal — also an audio-adjacent change, ask first.

## Housekeeping

- Branch `bugs/scratchy-audio-phones` is clean apart from this file. All scratch scripts, scratch builds (`dist-*`), and preview servers were in the session scratch folder / temp and have been stopped.
- Backlog #29 lists three unrelated intermittent full-suite test failures — not part of this.

---

## Update 2026-09-19 — new phone repro (this changes the picture)

Crawford re-ran it on the Pixel 8. **After ~5 minutes with most effect controls near max (reverb items, delay, random LFOs throughout), the audio distorted; then, while turning everything back down, it "stopped making music completely until I refreshed."** So the failure is not (only) a load problem: it needs a **hard-latched fault that turning parameters down does not clear**.

Nothing was changed or reproduced on desktop for this; the following is code reading only. **Do not treat any of it as confirmed.**

**Code facts checked this session**
- Global chain (`wireGlobalFxChain`, `src/engine/audioEngine/globalFx.ts`): `EQ3 → LPF → HPF → FeedbackDelay → Reverb → Compressor → Limiter → masterGain → destination` (natural-decay mode). Delay `feedback` UI/seed max is **0.95** (`globalAudioSeedRanges.ts`), delay time up to 10 s, reverb decay up to 10 s, filter Q up to 20.
- **Global LFOs can only drive EQ3 gains and LPF/HPF frequency and Q** (`GLOBAL_LFO_TARGET_IDS`), not delay feedback or reverb. Swing is computed **once, at connect time**, from the base value at that moment (`centeredSwingFromRange` in `lfoEngine.connectLfoTarget`); it is not recomputed when the base slider later moves.
- Voices: `triggerWithCap` increments `activeVoices` and only a `Tone.getContext().setTimeout` callback (main-thread-driven) releases it; `activeVoices >= MAX_POLYPHONY (16)` silently rejects notes. A code comment already documents this exact failure mode ("plays a few more notes, then nothing") from a different cause. Failure paths inside `triggerWithCap` do decrement; no permanent leak was found by reading.
- Nothing in `src/` resumes a suspended `AudioContext` or listens for `statechange`.

**Candidate causes, ranked by how well they fit "distorts under max settings, then silent forever, refresh fixes"** (all unverified):
1. **A non-finite value (Inf/NaN) latched in a recirculating node** — the feedback delay's loop, the reverb convolver, or a biquad. Once NaN circulates, lowering feedback/wet does not clear it (NaN × 0 = NaN) and everything downstream stays silent until the nodes are rebuilt. Fits the symptom best; **no code path producing Inf was found** (feedback is capped at 0.95), so the trigger is unknown. Note the distortion stage itself is plausible without a bug: feedback 0.95 with delay wet 1 and reverb wet 1 gives ~+26 dB of recirculating energy ahead of the compressor/limiter.
2. **The AudioContext was suspended/interrupted by Chrome Android** (heavy load, audio-focus change, power management) and the app never resumes it.
3. **`activeVoices` pinned at 16** after a long main-thread stall delayed the release timeouts (recovers only if the stall clears; permanent only if a release is lost).
4. A Tone exception loop (e.g. a start-time or non-finite-value error) — would show in the console.

**What to check on the phone the next time it goes silent** (USB remote debugging, `chrome://inspect`):
- **Does the UI still animate and respond?** (No → main-thread stall, cause 3/4. Yes → audio thread/context/graph, causes 1/2.)
- **Console:** any red errors or Tone warnings, and whether they repeat.
- **WebAudio panel:** context **state** (`running` vs `suspended`/`interrupted`), and whether *callback interval* / *current time* are still advancing.
- **Try Power off → Power on** (or Mute → Unmute) while silent. If sound returns, the engine can be recovered without a refresh, which narrows it to something a rebuild clears (cause 1). If not, ask whether it survives a tile change.
- Roughly which controls were maxed when the distortion began (delay feedback? delay wet? reverb wet/decay? filter Q?) — the more specific, the better.

**Proposed mitigations to discuss (each touches audio → ask first; none started):**
- **Self-healing guard:** tap the master output with an analyser; if the output is non-finite, or silent while notes are being triggered, rebuild the global FX chain (`buildGlobalFxChain`) and resume the context. Cause-agnostic, and also surfaces the bug instead of hiding it.
- **`statechange` → resume** handler (small, TDD-able), if the WebAudio panel shows suspension.
- **Headroom:** compensate or soft-limit the recirculating delay/reverb stage so maxed settings distort gracefully instead of hitting the limiter hard; consider a lower ceiling than 0.95 for delay feedback.
- The earlier options (opt-in `?latency=playback`; build voice chains only for audible robots) still stand for the *scratchy* symptom.

---

## Pinned-world measurement — 2026-09-19 (the world DOES matter)

Re-ran the audio-load measurement with the world fully pinned (`?seed=<w>&x=<n>&y=<n>`, new the same day). This settles the earlier retraction the other way: **audio render load varies substantially between worlds, far more than run-to-run noise.**

**Method.** Production build of the working tree (uncommitted `?x=`/`?y=` change plus an unrelated uncommitted CSS edit), `vite preview`, headless Chrome 153 on the desktop (no throttle; audio thread isn't throttled anyway). One fresh Chrome per run; click Power on; 8 s warm-up; then poll `WebAudio.getRealtimeData` every 500 ms for 20 s (~40 samples) and take the mean/max `renderCapacity`. 3 rounds, run one at a time in the foreground, start order rotated each round, `alpha` included twice per round as a same-world repeat; no orphaned Chrome before or after. Pin verified in-browser via the header's `@ x, y` readout. The script was scratch and is not kept — recreate from "How to measure" above.

| World (`seed:x:y`) | Runs | Mean render capacity per run | Mean of runs |
|---|---|---|---|
| `charlie:200:-30` | 3 | 0.358, 0.307, 0.321 | **0.329** |
| `alpha:12:68` | 6 | 0.398, 0.358, 0.384, 0.353, 0.380, 0.361 | **0.372** |
| `delta:5:-180` | 3 | 0.513, 0.483, 0.495 | **0.497** |
| `bravo:-150:90` | 3 | 0.560, 0.550, 0.550 | **0.553** |

- **Within a world the spread is tiny** (`alpha`: 0.353–0.398, i.e. ±0.02; `bravo`: 0.550–0.560). **Between worlds it is 0.33 → 0.55, ~1.7×.** So a pinned world is a reproducible benchmark, and the earlier 29%/72% swings on `?seed=` alone are most plausibly *different worlds*, not noise.
- **Callback interval** was 10.67 ms in every run (constant), so no scheduling jitter shows up on desktop; the load difference is render cost.
- **Peaks are not world-specific and are noisy:** max single-poll values reached 0.99 even in the cheap worlds (`charlie` 0.989, `alpha` 0.994 in round 3) while their means stayed ~0.3–0.4 — brief spikes, unexplained; don't read anything into a single max.
- **Absolute numbers are higher than the earlier 0.28 mean** (that was a random world, a 10.0 ms interval, a different session and measurement path) — compare across worlds within this table, not against the old figure.

**What this changes.** The Pixel 8's audio has been running an *unpinned, random* world each load; a heavy world (≈0.55 here, on a desktop core) leaves much less headroom on a phone core than a light one (≈0.33). That fits "scratchy on some loads" but is still **not proof of overload on the phone**. Also, "maxed effects → silent until refresh" may be a separate latched-fault bug; this data doesn't address it.

**Not yet known — the next questions.**
1. **What makes `bravo`/`delta` heavier than `charlie`?** Candidates (none checked): which/how many robots start active (2–4 of 12), waveform/oscillator-layer mix, seeded global FX values (delay feedback/wet, reverb decay/wet, filter Q), how many global LFOs start active. The seed-only-derived global FX (Attenuation Style map) and the coordinate-derived robots (locale map) can be separated by holding `seed` fixed and varying only `x`/`y` (and vice versa).
2. **Does the phone reproduce the ranking?** Load the same pinned URLs on the Pixel: a world that's heavy here should be the scratchy one there. That, plus the phone's WebAudio-panel render capacity, would finally tie the report to a cause.

Suggested phone A/B URLs (light → heavy): `?seed=charlie&x=200&y=-30`, `?seed=alpha&x=12&y=68`, `?seed=delta&x=5&y=-180`, `?seed=bravo&x=-150&y=90`.

---

## What makes a world heavy — global LFOs (2026-09-19, follow-up)

Follow-up to the pinned-world measurement above. Same method (headless Chrome, 20 s of `renderCapacity` polling after an 8 s warm-up, one Chrome per run, foreground, no orphans, ≥3 interleaved rounds).

**1. It's the seed (Attenuation Style), not the coordinates.** Crossing two seeds with two coordinate pairs (3 rounds):

| `?seed=` | @ 200,-30 | @ -150,90 |
|---|---|---|
| `charlie` | 0.339, 0.327, 0.302 → **0.323** | 0.341, 0.322, 0.335 → **0.333** |
| `bravo` | 0.546, 0.503, 0.536 → **0.528** | 0.554, 0.600, 0.568 → **0.574** |

The seed moves the load by ~0.22; the coordinates by ≤ ~0.05 (robots, BPM and day phase barely matter). So the cost lives in what the **Attenuation Style noise map** seeds: the global Audio Rig chain, the **global LFOs**, audio swells.

**2. The seeded values line up with the number of running global LFOs** (computed offline from `generateGlobalAudioSettings`/`generateGlobalLfoSettings`; `LFO_QUIET_THRESHOLD = 0.34` gives each of the 7 targets a ~34% chance of loading at rate 0):

| Seed | Global LFOs running (of 7) | Mean render capacity |
|---|---|---|
| `charlie` | 0 | ~0.33 |
| `alpha` | 1 | ~0.37 |
| `delta` | 7 | ~0.50 |
| `bravo` | 5 | ~0.55 |

Delay/reverb/filter/EQ values do **not** track the ranking (e.g. `delta` has the longest reverb and a wet delay yet is lighter than `bravo`).

**3. Ablation — the LFOs are causal, in both directions.** Two throwaway builds (source restored afterwards, not committed) that set `LFO_QUIET_THRESHOLD` to force every global LFO off / on; run interleaved against stock in the same session (3 rounds):

| Variant | Mean render capacity per run | Mean |
|---|---|---|
| `bravo` stock (5 LFOs on) | 0.592, 0.582, 0.534 | **0.569** |
| `bravo`, all global LFOs off | 0.398, 0.384, 0.452 | **0.411** |
| `charlie` stock (0 on) | 0.316, 0.300, 0.329 | **0.315** |
| `charlie`, all 7 global LFOs on | 0.450, 0.454, 0.499 | **0.468** |

Roughly **+0.02–0.03 of render capacity per running global LFO** — enough to take a quiet world (0.32) to a heavy one (0.47–0.57). Two things this doesn't explain: `bravo` with LFOs off (0.41) is still above `charlie` (0.32), so something else in the seeded chain adds ~0.1 (candidates: reverb decay/wet, filter values — unchecked); and `delta` (7 LFOs, 0.50) is lighter than `bravo` (5 LFOs, 0.55), so it isn't purely a count.

**Mechanism — hypothesis, NOT tested.** Global LFOs are `Tone.LFO`s connected straight onto the target's `Signal`/`Param` (`connectLfoTarget`, `src/engine/lfoEngine.ts`), i.e. audio-rate modulation of EQ3 gains and LPF/HPF frequency/Q. A Web Audio `BiquadFilterNode` whose frequency/Q/gain is driven by a connected signal typically has to recompute its coefficients every sample instead of once per 128-frame quantum, which would be expensive and would scale per modulated filter. (For contrast, `layerN.phase` LFOs already use a control-rate polling fallback via `scheduleRepeat`.) Confirm before acting — e.g. a scratch build that drives the same targets from a `scheduleRepeat` at ~30–60 Hz instead, measured against stock.

**Implication for the phone.** A random seed loads 0–7 global LFOs; the heavy ones cost about half as much again as the quiet ones on a desktop core. That fits "scratchy on some loads" on the Pixel but is **still unproven there** — the phone A/B (URLs above) is the missing check. `charlie`/`alpha` should be the calm ones and `bravo`/`delta` the scratchy ones if this is the cause.

**Options (all touch the audio/animation architecture → ask Crawford first; none started):**
- Drive global LFO targets at control rate (scheduled `setValueAtTime`/`linearRampToValueAtTime` steps on the transport) instead of audio-rate connection — the likely real fix if the mechanism holds.
- Cap or lower the number of global LFOs a fresh seed starts with (`LFO_QUIET_THRESHOLD`) — trivial, but only shifts the starting load; a user can still turn them all on.
- Adaptive: fall back to fewer/slower LFOs when the context reports high render capacity (needs a reliable signal; `renderCapacity` isn't available as a JS API in Chrome 153 desktop).

---

## Pixel 8 A/B and what a power cycle clears (2026-09-19, Crawford's report + code reading)

**Phone results (by ear, no DevTools data):**
- `charlie` (calm world: 0 global LFOs, ~0.33 on desktop): fine for ~2 min, then **cut out completely**. After ~30 s of silence Crawford flipped the power rocker off, then on: **~30 s later sound returned, with some scratches, and eventually ran clean again.**
- `bravo` (heavy world: 5 global LFOs, ~0.55 on desktop): **scratchy from the start**; at ~1 min it began **losing all sound for seconds at a time**; at ~90 s it was **gone for ~30 s**, **came back on its own** and stayed scratchy ("almost never clean").

**What this supports (still by ear — not measured):**
- The world/LFO ranking holds for **scratchiness** (bravo worse than charlie from the first second), which fits audio-thread load.
- **Total dropouts happen in the calm world too, and get worse with time** (charlie ~2 min, bravo ~1 min, dropouts lengthening) — so LFO count alone doesn't explain them; a heavy world just reaches them sooner. A heat/throttling ramp or accumulating load fits; nothing here tests it.
- **The bravo silence ended without any intervention**, so at least that failure is not a permanent latch.

**What a power off→on actually does** (`powerController.ts`, `AudioEngine.killAll()/start()`): it does **not** rebuild the global FX chain (`instrumentsLoaded` survives; the delay/reverb/filter/EQ nodes are the same ones) and does not recreate the AudioContext. It **does**: `transport.cancel()`+stop+reset, `activeVoices = 0`, `resetBeatClock()`, then on start `await Tone.start()` (which resumes a suspended context), transport start, re-prime global LFOs, restart melody playback/harmony, and `reRegisterAllRobotsAudio` (releases and re-reserves **every robot's voice chain** — heavy main-thread work, a plausible reason sound took ~30 s to return).

**Effect on the hypotheses:**
- **Latched Inf/NaN in the delay/reverb/filter loop — now unlikely.** A power cycle wouldn't clear it (same FX nodes) and sound came back. (A NaN confined to a per-robot voice chain would be cleared, so that variant is not excluded.)
- **Still open, all cleared by a power cycle:** a suspended/interrupted AudioContext that `Tone.start()` resumed (the app never listens for `statechange`); `activeVoices` pinned at 16 (its release timeouts run on the main thread, so long stalls delay them); stale transport/scheduler state; or a voice-chain-level fault. The bravo self-recovery favours a stall/starvation that eventually cleared over a hard fault.
- **Missing, and now the key discriminator:** does the UI keep animating during a dropout (audio-only failure) or freeze (main-thread stall)? What does the WebAudio panel say about context state and render capacity? Neither was captured.

---

## Diagnostic tools built (2026-09-19) — `?debug` overlay and `?latency=` switch

Approved by Crawford after the phone A/B above; full usage and how to read the overlay are in [PERFORMANCE.md](../PERFORMANCE.md#diagnosing-audio-on-a-real-phone--debug-latency-pinned-worlds). Summary:

- **`?debug`** — read-only overlay (context state, audio-clock rate, UI frame rate, main-thread lag, active voices, active global LFOs, latency hint, plus an edge-triggered event log with timestamps: "audio clock stalled/recovered", "main thread stalled", "UI frames stopped/resumed", `AudioContext` `statechange`). Meant to be left on and read *after* a dropout, or screenshotted.
- **`?latency=playback|balanced|interactive`** — opt-in A/B of the Web Audio latency hint (default unchanged). Installed before any Tone node exists (`src/engine/audioContextSetup.ts`).
- Verified in headless Chrome: HUD values match the offline computation (`charlie` LFOs 0/7, `bravo` 5/7); a forced 2 s main-thread freeze shows as "main thread stalled ~1639 ms" with the audio clock unaffected (x1.01), so main-thread and audio-thread stalls are distinguishable. **Not yet run on the Pixel.**

**Suggested phone protocol** (same pinned worlds, so runs are comparable): load `…/?debug&seed=charlie&x=200&y=-30` and `…/?debug&seed=bravo&x=-150&y=90`, let each run until it drops out, and note the overlay's red border, the event log, and `ctx` / `clock` / `fps` / `lag` / `voices` at that moment. Then repeat with `&latency=playback` added. Open questions each answers: which dropout signature (audio-thread stall vs suspended context vs main-thread stall vs voices pinned at 16), and whether `playback` changes scratchiness or the dropouts.

---

## Pixel 8 with `?debug` and `?latency=` (2026-09-20, by ear, one run each)

Loaded from the PC's preview server over the LAN (after the insecure-context `crypto.randomUUID` fix above). Pinned worlds. Times are minutes:seconds from power-on.

| Run | Clicks | Full dropouts | Overlay stripe |
|---|---|---|---|
| `charlie`, default (`interactive`) | Waves: increasing from ~0:30 for ~1 min, cleared; a few clicks ~2:00 for ~1 min; then only occasional clicks to 5:00 | None | Never red |
| `charlie`, `&latency=playback` | "Same experience" as above | None | Never red |
| `bravo`, default | Clicky almost immediately; bad by 0:30; **out at 0:40, silent until ~1:20**; very clicky after; bad again ~2:20; intermittent dropouts to 3:00; **15 s total dropout at 3:00** | 3+ | **not reported** — see open question |
| `bravo`, `&latency=playback` | Clicky throughout; a clear moment ~1:20–1:30; a little clickier ~1:50 and ~2:30 | **None** | Never red |

**Reading (n = 1 per row, judged by ear — suggestive, not established):**
- On the heavy world, `playback` removed the full dropouts and reduced (but did not remove) the clicking. On the calm world it made no noticeable difference.
- Clicks come in **waves that clear on their own** (charlie ~0:30–1:30, again ~2:00–3:00) — not a steady load. Something that varies over time: phone clock speed/heat, other processes, or app activity that varies (robots waking/docking, swells, harmony changes). Not identified.
- The earlier `charlie` total cutout at ~2:00 (2026-09-19, before the overlay existed) **did not recur** in either run today, so that dropout is intermittent on the calm world.
- Even the calm world (≈0.33 render capacity on desktop) clicks on the phone, so the *baseline* graph (~1,000 nodes, all 12 robots' voice chains built) is likely near the phone's budget by itself; global LFOs push it over.
- `playoutStats` / `renderCapacity` JS APIs are absent in Chrome 153 desktop, so the overlay cannot count glitches directly; whether the Pixel's Chrome has them is unknown. *[Correction 2026-09-21: `playoutStats` is the API's old name. It is now `AudioContext.playbackStats` (`underrunEvents`, `underrunDuration`, latency fields), present in Chrome 146+ — probed on headless Chrome 153, and Crawford's Pixel is on Chrome 153 — and the `?debug` overlay now shows it. `renderCapacity` remains absent.]*

**Open question — decisive:** what did the overlay show during `bravo` (default)'s total dropouts (0:40–1:20, 3:00)? If the stripe stayed green — `ctx running`, `clock` ≈ x1.00, `fps` and `lag` fine — while silent, the failure is downstream of everything the overlay measures (the device output stream, or silence inside the graph). If red, its event log says which signature it was.

---

## Load follows how many robots are *sounding*, in waves (2026-09-20, desktop; found while scoping "voice chains only when audible")

**Simulation** of the Docked↔Active battery cycle with the real constants (`docs/ROBOT_LIFECYCLE.md`; 200 random rosters; job surcharge picked uniformly, cap 3 per type — an approximation, the real assignment is affinity-scored): audible robots (= `audioMode` not `mute` ≈ `Active`, plus the `Departing` hold) do not stay at the initial 2–4. Mean by measure: 2 → 4.3 (m5) → 6.4 (m10) → **7.9 (m15) → 8.5 (m20)** → 4.4 (m30, the first cohort all departing) → ~5.5–6.4 thereafter (range ~4–8, occasionally 10–12). At 60 BPM a measure is 4 s, so the first peak is ~1:00–1:20 and the dip ~2:00 — **which lines up with the phone's `charlie` click waves** (rising from ~0:30, clearing ~1:30–2:00, a few more 2:00–3:00). The world's real BPM is seeded per locale, so the time axis is approximate.

**Measurement** (`charlie:200:-30`, 0 global LFOs, production build, desktop, mean render capacity per ~15 s bucket, one 4-minute run):
`0.36 → 0.37 → 0.40 → 0.46 (t≈65 s) → 0.46 → 0.35 → 0.32 (t≈110 s) → 0.49 → 0.48 (t≈130–140 s, max 0.99) → 0.41 → 0.33 → 0.32 → 0.27 → 0.27 (t≈205–220 s) → 0.33`.
So a world with **no LFOs** still swings ±0.1–0.2 (about ±30%) over a ~1–2 minute cycle — far above the ±0.02 same-world noise floor — consistent with load tracking the number of robots sounding at once (per-note synth work), not only the static graph. **Not yet correlated directly:** the audible-robot count isn't shown anywhere yet (the overlay could show it), and n = 1.

**Consequence for "build voice chains only for audible robots":** it removes only the *idle* cost of muted robots (measured earlier: 12 robots ≈ 24% vs 3 robots ≈ 16–20% when quiet — a few points of render capacity, less as more robots wake). At the peaks that cause the clicks, ~8 of 12 robots are audible, so it frees only ~4 idle chains exactly when relief is needed. The earlier claim that it is "likely the biggest win" is **not supported** by this data. Levers aimed at the peaks: cap simultaneously *audible* robots and/or polyphony (a quality setting), cheaper per-note synth cost, `latencyHint: 'playback'`.

---

## What each kind of LFO costs (2026-09-20, desktop; scoping "turn LFOs down on lighter presets")

"Stacked LFOs" in this codebase = the **drift** subsystem (`src/engine/lfoDrift.ts`): shared secondary LFO pools modulate every connected primary LFO's rate and depth through a Gain pair, so a world doesn't sound identical forever. Drift amounts are seeded non-zero for every seed tried, so drift is live whenever any LFO is connected.

**Method:** throwaway builds (source restored, never committed) on the calm world `charlie:200:-30` (0 LFOs at stock, so each variant's cost is additive), mean render capacity over 20 s after an 8 s warm-up, 3 rounds interleaved with a rotated start order, foreground, no orphaned Chrome. Compared as **differences from the same-round stock run** because absolute levels wander between rounds with the robot waves (stock ranged 0.30–0.41).

| Variant (charlie) | Δ vs same-round stock, rounds 1 / 2 / 3 | Mean Δ |
|---|---|---|
| 3 EQ-gain LFOs (`eq3.low/mid/high`) | +.03 / +.00 / +.02 | **+0.02** (≈ +0.006 each — nearly free) |
| 2 filter-**frequency** LFOs (`lpf/hpf.frequency`) | +.22 / +.06 / +.09 | **+0.12** (≈ +0.06 each) |
| 2 filter-**Q** LFOs (`lpf/hpf.Q`) | +.13 / +.18 / +.06 | **+0.12** (≈ +0.06 each) |
| all 7 global LFOs | +.16 / +.25 / +.16 | **+0.19** |
| all 7, **drift removed** | +.10 / +.06 / +.08 | **+0.08** |
| **51 robot LFOs** connected (every seeded, connectable robot LFO; 77 had rate > 0, the rest can't attach) | saturated: capacity ≈ **1.0**, callback interval **10.7 → 19–20 ms** (deadline misses, on desktop) | ≫ |

**Reading (n = 3; same-round noise ≈ ±0.05; parts do not sum exactly to the whole, so treat as ordering, not arithmetic):**
- **Drift is roughly half of the global-LFO cost** (0.19 → 0.08 with it removed). It is the single cheapest thing to switch off.
- **Modulating a filter's frequency or Q is expensive; modulating EQ gains is nearly free.** This fits — but does not prove — the earlier hypothesis that audio-rate modulation forces per-sample biquad recomputation (EQ3's bands are gains; the filters are biquads).
- **Robot LFOs are absent by default** (`spawnSystem` seeds their settings but nothing connects them until a user edits one in Robot Options), so they are not today's cost. But 51 at once overloads the audio thread even on this desktop, so an unbounded user-enabled count is a real hazard. Per-target-type robot costs (gain / detune / pulse width / phase) were **not** separated.
- The `robotlfo` variant needed its connections delayed a few seconds after power-on (robots spawn after `powerController.start()` runs); the first attempt connected zero and was discarded.

## Measured for the Audio Load Budget (2026-09-20, desktop — plan tasks 3 and 4)

The scratch scripts above are now `npm run perf:audio` ([PERFORMANCE.md](../PERFORMANCE.md#audio-render-capacity-series--npm-run-perfaudio)); the `?debug` overlay also shows `audible n/12`. Full tables, method and caveats are in PERFORMANCE.md; the results that matter here:

- **Load does track how many robots are audible** (pre-change baseline, code `4bab2ea`, 3 runs per world × 240 s): per-world r = 0.74–0.94, ≈ **2 capacity points per audible robot** in both `charlie` and `bravo`; `bravo` sits ≈ 0.17 higher at the same audible count (its 5 global LFOs). Peak window (highest 15 s bucket mean): `charlie` **0.414**, `bravo` **0.558**; overall mean 0.327 / 0.488; noise band ≈ ±0.02. The raw both-worlds-pooled r is only 0.38 because of that world offset (0.81 once removed) — recorded as a judgment call for Checkpoint A. This confirms, with a controlled-enough series, the "waves follow sounding robots" inference above.
- **A robot LFO costs ≈ +0.012 render capacity each (drift off), linear in count** — `volume`/`gain`/`detune` alike (`gain`: +0.0119 / +0.0114 / +0.0117 per LFO at N = 4 / 12 / 28); **28 of them do not double the callback interval** (10.69 ms; capacity ≈ 0.66 mean). **A `pulseWidth` LFO costs ≈ 0.08 (≈ 7×)** but a world has only 0–2 pulse layers. **Drift adds ≈ 0.085 on top of 12 robot LFOs** — it is what makes the *first* robot LFO expensive (the shared drift pool of 8 LFOs). Robot-LFO caps therefore stay **4 (Light) / 12 (Standard)**, now measured rather than assumed; Standard's margin to the 0.9 criterion is thin under pessimistic inputs (cap 8 is the alternative).
- The earlier "51 robot LFOs saturate" is consistent: 51 × 0.012 ≈ +0.6 on a 0.34 stock.

## Desktop results of the finished Audio Load Budget (2026-09-21, plan task 24)

Same-session interleaved A/B against the pre-feature build, 3 runs per arm per world (full tables in [PERFORMANCE.md](../PERFORMANCE.md#audio-load-budget--the-finished-feature-against-the-gates-2026-09-21-plan-task-24)). **Light** lowers the peak render capacity by **29 % on `charlie`** and **37 % on `bravo`** (the boot-time `playback` latency hint accounts for much of it — caps alone gave −18 % on `charlie`); **Standard** by 13 % (peak, `bravo`) but only 0.069 in the mean (gate ≥ 0.10 **missed**) and ≈ 0 on `charlie`; **Full is unchanged** (±0.03 of the pre-feature build). Robot-LFO stress at the shipped caps stays < 0.9 with no callback-interval doubling (36 `detune` LFOs requested: 4 connect at Light, 12 at Standard; uncapped at Full the same 36 saturate at 0.99). The phone is the check that matters — next section.

## Phone protocol for the Audio Load Budget — Crawford's run (plan task 25, prepared 2026-09-21)

The desktop gates are recorded in [PERFORMANCE.md](../PERFORMANCE.md#audio-load-budget--the-finished-feature-against-the-gates-2026-09-21-plan-task-24); **the phone is the check that matters** (spec §5.3 criterion 6 — by ear, recorded, not gated). Everything below was verified from the PC over the LAN address on 2026-09-21: all eight URLs load and power on from `http://<lan-ip>:4173` (an insecure context, as the phone will see it), read the expected preset and latency in the overlay, and leave one live realtime AudioContext.

**Set-up.** PC and phone on the same Wi-Fi. On the PC: `npm run build && npx vite preview --host --port 4173` (a Windows firewall prompt may need allowing), then `ipconfig` for the IPv4 address. Use the same Chrome on the Pixel 8 as before (incognito, as in the original report). Keep the phone unplugged, screen on, brightness fixed, and let it cool between runs — heat throttles the audio thread too.

**URL matrix.** Base `http://<pc-ip>:4173/trace-atlas/?debug&seed=…&x=…&y=…`. Tap the power rocker, then leave it alone for **5 minutes each**. Suggested order (calm world first, the control last so a bad run does not colour the next):

| # | World | Suffix after the pinned world | What it is |
|---|---|---|---|
| 1 | `charlie` (`seed=charlie&x=200&y=-30`) | `&load=light` | Light: 4 robots, 8 notes, no drift, no filter LFOs, **playback** latency |
| 2 | `charlie` | `&load=standard` | Standard: 8 robots, 12 notes, no drift, `interactive` latency |
| 3 | `charlie` | `&load=standard&latency=playback` | Standard with Light's latency only |
| 4 | `charlie` | `&load=full` | Full = today's behavior (the control) |
| 5–8 | `bravo` (`seed=bravo&x=-150&y=90`) | the same four suffixes | `bravo` has 5 global LFOs — the heavy world |

(On the phone a URL with **no** `load=` defaults to Light automatically — a coarse-pointer device. In the app the control is Fleet Params → Transport & Composition → Audio Load; the chosen preset is mirrored into the address bar, and its latency applies on the next load.)

**What to write down for each run** (a screenshot of the overlay at the bad moment is worth a paragraph):

| Field | How |
|---|---|
| Full dropouts | none / how many / the longest, roughly |
| Clicks compared with before (run 4, or the original report) | by ear: none / fewer / same / more; are they in waves? |
| The overlay **at the moment clicks start**: `sounding n/cap`, `audible n/12`, `poly used/cap` | read `load … · sounding … · standing by … · poly …` and the `voices … audible …` line |
| The overlay's `latency … base …ms` line | confirms which context you actually got (playback ≈ 21 ms, interactive ≈ 11 ms on the PC) |
| Anything else | the red border, the event log text, `clock x…`, `lag …` |

**What each comparison answers.**
- 4 vs 2 vs 1: how much of the relief needs Light's *everything*, versus Standard's caps-and-drift alone.
- 2 vs 3: **does `playback` matter at Standard?** (decision J left Standard on `interactive` pending exactly this.) If 3 is clean and 2 is not, Standard should take `playback`.
- 3 vs 1: what the tighter caps and the filter-LFO tier add on top of the latency hint.
- `charlie` vs `bravo`: whether the LFO tiers matter on the phone as they do on the desktop.
- If Light is **not** enough, that is a finding, not a failure: the spec's further levers are lazy voice chains (Phase B — measured a weak lever on its own), a lower robot floor than 2–4, and a raised Tone `lookAhead` (17.2.4, deliberately held).

**Crawford's results (by ear), run 2026-09-21 — recorded verbatim below, then read plainly.** The table is a short summary of his notes; his own words follow it unedited. The overlay readings are **my transcription of his screenshots**, which arrived unlabelled and were matched to runs by the overlay's `load`, `latency` and world lines and by the phone clock. One run per row, except: four takes for run 7, and for run 8 a first round (several attempts) plus two later takes after he let the phone rest and unplugged it (take 2 and take 3, told apart by the phone clock — see below); run 1 had no screenshots. He sent the take 2 and take 3 material live, so those notes are in the order he sent them.

| # | URL suffix | Dropouts | Clicks (his words, shortened) | Overlay at the moment of clicks | Notes |
|---|---|---|---|---|---|
| 1 | charlie · light | none | none — "all green, no distortion at all for 7 minutes" | no screenshots; all green | |
| 2 | charlie · standard | none (a moment of silence at 2:22 when he tapped away from the tab) | "very occasional clicks, like one every few seconds" 0:50–1:30; more ~2:00–2:15; again from 4:34; "too much for my requirements" | never red | low battery, not charging (see conditions) |
| 3 | charlie · standard + playback | none | "A few clicks starting around 3:44 til 3:55, but not many" | never red | charging |
| 4 | charlie · full | none | light clicks from 0:32; more ~1:15; clear ~1:40–2:00; clicks even in the ~3:35 quiet part; more ~4:30 | never red | charging |
| 5 | bravo · light | none | "Very light clicks" from ~0:40, on and off; "pretty bad" ~4:50 | never red | charging |
| 6 | bravo · standard | one, ~4:55–5:02 | "bad at 1:05", clean for 10 s ~2:05, "really bad around 2:50 - 4:50" | never red | charging |
| 7 | bravo · standard + playback | take 1: out ~0:40 and silent until he changed coordinates at ~4:55; take 2: out ~1:00; take 3: out ~0:30; take 4 (reported afterwards): none reported by 1:15, then ~3 s of distortion (may still have been running) | take 1: light clicks from ~0:15; red seen "several times around 1:20"; take 4: "havent' had any distortion yet til 1:15" | see transcription (takes 1–3; no screenshots of take 4 yet) | power button (~3:20), mute/unmute and tempo did not recover it; new coordinates did, after ~6 s |
| 8 | bravo · full | **first round:** out by 0:32 (one second back at ~0:40), then out; a refresh, a second try and a Chrome restart played nothing. **Take 2 (rested):** one ~15 s dropout at ~2:30. **Take 3 (rested):** a long dropout from about 2:19, still out when he stopped at ~3:00 | first round: "Opened to distortion and UI issues". Take 2: one click at :53, a "big pickup" at 1:06, clean at one robot at 1:30, dirty again at four robots at 1:48. Take 3: "a good amount of distortion" before the dropout | see transcription | first round charging; takes 2 and 3 unplugged, on the phone speaker |

**Crawford's notes, verbatim** (typos and all; the run order is his):

```text
?debug&seed=charlie&x=200&y=-30&load=light
No issues (all green, no distortion at all for 7 minutes

http://192.168.12.231:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30&load=standard
Around :50 - 1:30 there were very occasional clicks, like one every few seconds, here are some sample screenshots of the time. Again around 2:00 there were more, but the soon dissipated (like around 2:15) At 2:22 i accidentally tapped away to a screenshot editing screen, went immediately back, and audio was stopped for just a moment before picking up seeming without issue, and i'm ok with it taking a moment to get its bearings when taken out of focus. Around 4:34 clicking started back up. Overall, nothing turned red, and while the clicking was too much for my requirements, it was not too bad given the state of things.

http://192.168.12.231:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30&load=standard&latency=playback
A few clicks starting around 3:44 til 3:55, but not many. Nothing turned red, nothing else to report.

http://192.168.12.231:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30&load=full
Clicks start around 0:32, but only a little. A little uptick around 1:15, but clear again around 1:40 til around 2:00, then just light clicks. Even at the 3:35ish quiet part there were clicks. Around 4:30 there were even more clicks for a little bit. Never turned red.

http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=light
Very light clicks started around 0:40 for about 20 seconds. Again starting at 1:50 - 2:00. Very light clicks til about 3:00 when it picked up a bit til around 3:30, when it went back to very light clicks continually, around 4:50 it got pretty bad.

http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=standard
A few clicks start at 0:50, it's bad at 1:05, but gradually gets better til about 1:30, then it picks back up again until 2:05. Then it's clean for 10 seconds! Then it's bad again for a while. It's really bad around 2:50 - 4:50, and around 4:55 it cut out til 5:02

http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=standard&latency=playback
Light clicks start around :15. Completely cut out around 0:40. I see now that i might have missed red before because it flashes really quickly, but this time i saw it several times around 1:20 or so. At 3:20ish i hit the power button to see if that would get sound back. It did not, nor did mute/unmute, or changing tempo. Retransmitting to new AS and coords did, with about a 6 second delay, which i did around 4:55.

I ran it a second time, this time it made it til about 1:00 before cutting out.
Third time, it started off scratchy, had some ui issues, and at :30 it cut out entirely

(sent afterwards, as two separate messages, while this was being recorded:)
i'm running http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=standard&latency=playback again, and now i havent' had any distortion yet til 1:15 in
and then it was only for like 3 seconds

http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=full

Opened to distortion and UI issues recorded. Completely out by 0:32, but came in briefly at 0:40 for one second tops. Then out again indefinitely.

I refreshed, and it loaded without playing anything. Tried again, still nothing. Restarted chrome, still nothing.

(later, after the phone had cooled — separate messages, the third with two screenshots:)
reran option http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=full after letting the phone cool a bit. no scratches so far, :40 in at the moment
one single click at :53. big pickup of them at 1:06, it's pretty bad. at 1:30 it dropped to one robots and was clean again.  now at 1:48 there are four robots and its dirty.
2:30 in and it's completely out for 15 seconds or so

(with six more screenshots:)
"dirty" is pre-dropout, just when there was a good amount of distortion. the remaining images here are all from the same long drop out. this was from http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=full

(asked whether it came back, and what the output was:)
phone speaker. session was terminated before it came back on, probably around 3:00 or so in.
```

**Conditions visible in the screenshots** (the protocol asked for the phone unplugged, brightness fixed, and a cool-down between runs; none of this was asked of him, it is what the status bar shows):
- **Charging.** The lightning bolt is in the status bar in every screenshot from 12:39 on — runs 3 to 8 — so all bravo runs were on a charging phone. Run 2's screenshots (12:00–12:03) show no bolt, a battery icon that has gone red by 12:03, and what looks like the battery-saver icon; that run was on a nearly empty battery.
- **Back to back.** Phone-clock start times from the screenshots: run 2 ≈ 11:59, run 3 ≈ 12:35, run 4 ≈ 1:08, run 5 ≈ 1:17, run 6 ≈ 1:27, run 7 ≈ 1:36 / 1:43 / 1:44 (three takes), run 8 ≈ 1:50 onward. The bravo runs were about ten minutes apart, five minutes each, and the worst ones came last.
- **Stopwatch offset.** The overlay's `up` and his stopwatch can differ by a few seconds (the context starts 1–8 s into `up`), so matches "to the second" below are approximate.
- **Second round (run 8 takes 2 and 3).** The status bar shows no charging bolt, and he confirmed the phone speaker (so not Bluetooth). By the phone clock the two shots at 2:14 (`up` 2:57 and 3:10) are one page load that started ≈ 2:11 (take 2), and the six shots at 2:19–2:20 (`up` 1:38–2:44) another that started ≈ 2:17:30 (take 3). He did not confirm that split; it is my reading of the clock, and the take 2 shots were taken after its ~15 s silence.

**Overlay transcription** (mine, from the screenshots; `up` is the overlay's uptime; `poly` is used/cap; "start-up" events are the ones stamped 0:01–0:08):

| Run | Shots (`up`) | Sounding · poly | Audio clock | Events beyond start-up | fps · lag |
|---|---|---|---|---|---|
| 2 charlie standard | 4 (0:57–4:42) | 7–8 of 8 · 6–10/12 | x1.00 | `2:22 audio clock stalled (x0.24), recovered after 1.5s` (his tap-away); start-up `stalled (x0.49)` for 0.9 s | 38–60 · ≤ 7 ms (max 399) |
| 3 charlie standard + playback | 1 (3:46) | 5 of 8 · 3/12 | x0.97 | none; `latency playback … base 21ms` | 56 · 3 ms (max 236) |
| 4 charlie full | 6 (0:34–4:37) | 3–8 of 12 · 2–10/16 | x1.00–1.01 | none | 45–57 · ≤ 12 ms (max 249) |
| 5 bravo light | 5 (0:56–4:52) | 4 of 4, standing by 0–3 · 4–7/8 | x0.96–1.06 | none; `latency playback … base 21ms` | 33–46 · ≤ 45 ms (max 124) |
| 6 bravo standard | 8 (0:54–4:58) | 1–7 of 8 · 2–11/12 | x1.00–1.01 | none; start-up `audio clock stalled (x0.01)` 0.5 s only | 35–59 · ≤ 1 ms (max 29→106) |
| 7 take 1 (bravo standard + playback) | 8 (0:19–4:56) | 4–8 of 8 · 5–12/12 | x0.96 → x0.68 (up 1:19, 1:27) → x0.94–1.02 | `audio clock stalled` at up 1:02 (x0.45), 1:13 (x0.28), 1:18 (x0.43), 1:19 (x0.47), 1:27 (x0.47), each recovering in 0.4–0.5 s; `main thread stalled` ~1501 ms at 3:22, ~579 ms at 4:24, ~715 ms at 4:44; start-up main-thread stall ~1049 ms | 16–52 · ≤ 24 ms (fps 16 at up 1:19) |
| 7 take 2 | 1 (0:53) | 7 of 8 · 6/12 | x0.98 | start-up main-thread stall ~915 ms | 37 · 0 |
| 7 take 3 | 1 (0:34) | 7 of 8 · 6/12 | x0.86 | `UI frames stopped/resumed` three times, main-thread stall ~1300 ms, all at start-up | 32 · 0 |
| 8 bravo full, first take | 2 (0:12, 0:45) | 4 → 8 of 12 · 7 → **15/16** | x1.00–1.01 | start-up main-thread stall ~1077 ms + `UI frames stopped/resumed` | 43–52 · 0–4 ms |
| 8 bravo full, the three later attempts (1:52–1:53, 12–15 s after load) | 3 (0:12–0:15) | 4 of 12 · 4–7/16 | x0.88–1.04 | start-up main-thread stalls ~0.9–1.2 s; one start-up `audio clock stalled (x0.01)` 0.6 s | 27–38 · ≤ 25 ms |
| 8 take 2 (rested, unplugged) | 2 (2:57, 3:10) | 6/12 · 5/16; 4/12 · 7/16 | x1.01; x1.00 | none — only `0:01 context suspended → running`, though the shots come after his ~15 s silence | 47, 44 · 0–3 ms (max 188) |
| 8 take 3 (rested, unplugged) | 6 (1:38–2:44) | 3/12 · 6/16 (his "dirty", pre-dropout); then, inside the dropout: 5/12 · 4/16, 6/12 · 11/16, 8/12 · 13/16, 8/12 · 11/16, 6/12 · 6/16 | x1.01 pre-dropout; x0.98–1.06 in it | none in any shot (three are partly covered by the Android share sheet; the visible log lines show only the start-up one) | 39–47 · ≤ 38 ms (max 145) |

Every run shows `context suspended → running` a few seconds in. Every screenshot has `LFOs 5/7` on bravo and `0/7` on charlie, and the `latency … base …ms` line matched the preset (playback 21 ms, interactive 5 ms).

**Plain reading** (n = 1 per row, by ear, with the confounders above — suggestive, not established):

1. **Light is the only preset that was clean or nearly clean on both worlds.** `charlie` was clean for seven minutes. `bravo` had very light clicks throughout and got "pretty bad" at ~4:50, but no full dropout in five minutes; on 2026-09-20 the same world with no preset (today's behavior) dropped out three or more times. Every other preset clicked more or dropped out on the same world. The direction matches the desktop numbers (Light −29 % / −37 %).
2. **Which part of Light does the work cannot be separated from this run.** Light changes several things at once (4 robots, 8 notes, no drift, no filter LFOs, robot-LFO cap 4, `playback`), and only one pair on the phone differs in a single lever (runs 2 vs 3, latency). What the rows do say: on `charlie` (no global LFOs) Light was clean, Standard + playback nearly clean, Standard in waves and Full lightly clicking, so on that world the robot cap and the latency hint both look like they matter. On `bravo` (five global LFOs) the presets that keep the filter LFOs — Standard, with or without `playback` — were the ones that failed hard, and Light, which drops them, did not; that fits the desktop cost of filter-frequency/Q LFOs (≈ +0.06 each) but the 4-robot cap is a second difference and cannot be told apart from it here.
3. **Decision J (does Standard need `playback`) is not settled.** On `charlie` it helped a little (waves of clicks → a few clicks at 3:44–3:55). On `bravo` the first three takes looked worse: all cut out within a minute, whereas Standard without it held until ~4:55. But the first three ran third in a row on a charging, warming phone, and the Standard-without-`playback` run ran before them, so an order effect was as likely as a `playback` effect. **A fourth take of the same URL, run afterwards, was clean until 1:15 and then distorted for only ~3 s** (his report; no screenshots yet, and whether it was cooled, unplugged or still running is not known). So the same URL has now ranged from out-by-0:30 to clean-past-a-minute: run-to-run variance on the phone is large, and one take per preset cannot rank Standard against Standard + `playback`. The run that would settle it — several takes of each, alternating, unplugged and cooled — was not done.
4. **What the overlay showed, and what it could not.**
   - Clicks in every run left **no event** in the log: after the start-up lines nothing is recorded, though he heard clicks in runs 2 to 6. The stall detector flags stalls of roughly 0.4 s and up; clicks are shorter. A quiet log does not mean clean audio.
   - **Run 6's dropout left no trace.** At `up` 4:58 — inside his 4:55–5:02 silence, give or take the stopwatch offset — the overlay reads `ctx running`, `clock x1.01`, `fps 38`, `lag 0ms`, `sounding 7/8`, and nothing was logged. That answers the open question from 2026-09-20 for this dropout: silence with everything the overlay measures looking normal.
   - **Run 7 take 1 did record real audio-thread starvation**, at the time he saw red (~1:20): five windows between `up` 1:02 and 1:27 where the audio clock ran at ×0.28–0.47 of real time, the readout at ×0.68 and fps down to 16 at 1:19. But he was already silent at ~0:40, before the first flagged stall, and after 1:27 no further stalls were logged while it stayed silent for minutes: at `up` 2:52 and 3:30 the context was `running` with the clock at x0.94–0.95. So the long silence was not an audio-clock stall.
   - **Run 8: silence while the app saw nothing wrong.** The three later attempts (12–15 s after load; they match his "refreshed … tried again … restarted Chrome") show notes being triggered (`poly` 4–7/16, `sounding` 4/12), `ctx running` and a clock at x0.88–1.04, while he heard nothing. Nothing the overlay measures distinguishes them from a working start.
   - **Run 8 takes 2 and 3 (rested, unplugged, speaker) add two more silent-but-green dropouts.** Five shots of take 3 span `up` 2:19–2:44, inside a dropout that was still going when he stopped at ~3:00, and every one reads `ctx running`, `clock` x0.98–1.06, `sounding` 5–8/12, `poly` 4–13/16 (notes being scheduled), with nothing logged and lag peaking at 145 ms. Take 2's ~15 s dropout left no event either. Counting run 6, that is three dropouts on `bravo` in which everything the overlay measures looked normal.
5. **Recovery, and a correction to what I said earlier this session.** Power off/on, mute/unmute and a tempo change did not bring the sound back; retransmitting to new coordinates did, after ~6 s. I first read that as pointing at a fault latched in the global FX chain. From the code that does not hold: `buildGlobalFxChain` runs once (`loadInstruments`), and an Attenuation Style or locale change only pushes new *values* to the same nodes (`regenerateGlobalAudioFromSeed` → `applyGlobalAudioToEngine`), while the recovery screenshot still says `bravo` and `LFOs 5/7` — the seed was pinned by the URL and only the coordinates changed. So the FX chain and the LFO set were not rebuilt or changed. What else a locale switch replaces (the roster and its voice chains are the obvious candidate) has **not been checked**; per-robot state is a candidate, the output stream is another, and neither is tested. What can be said: the 1.5 s `main thread stalled` at up 3:22 lines up with his power-button press, consistent with the power cycle's heavy re-registration of every voice chain — and it did not help. Run 8 take 3 did not recover by itself in at least 40 s (from about 2:19 to his stop at ~3:00).
6. **What remains if Light is not enough.** Light still clicked on `bravo`, and clicks happen in quiet moments: run 4's screenshot at `up` 3:32 — his "3:35ish quiet part" — reads `audible 3/12`, `voices 2/16`; run 6 was "really bad around 2:50 - 4:50" with `poly` 3–9/12. So the cost is not only the robots sounding: the always-on graph (~1,000 nodes, all 12 robots' voice chains built) is a candidate, which would make the spec's deferred Phase B (lazy voice chains; measured a weak lever on desktop) worth re-measuring on the phone rather than dismissing. The other levers already named — a lower robot floor than 2–4 and a raised Tone `lookAhead` (17.2.4, held) — stand. The robot-count link is loose: in take 2 he heard clean audio at one robot and dirty at four, but take 3's distortion appeared at three (`sounding 3/12`, `poly 6/16`).
7. **What the second round (rested, unplugged, phone speaker) changes.** Charging, heat and Bluetooth do not explain the `bravo` Full dropouts: take 2 had a ~15 s one and take 3 a one of at least 40 s that had not recovered when he stopped, on a rested, unplugged phone playing through its speaker, and both left the overlay green. Only Full was re-run this way, so the readings above for Light, Standard and Standard + `playback` still carry the first round's confounders.
8. **Confounders to weigh before leaning on any of this.** Charging on runs 3 to 8, a nearly empty battery on run 2, back-to-back runs with the worst last, one run per cell (and the one cell with four takes ranging from out-by-0:30 to nearly clean), judged by ear, and a phone whose Chrome could not play anything after run 8 even after a restart (whether other apps could was not reported).

**Open when this reading was written** (Crawford's calls, decided afterwards — see below): whether Standard takes `playback` (decision J), what to do about Standard's missed desktop gate ([PERFORMANCE.md](../PERFORMANCE.md#decision-for-crawford-plan-task-24-report-a-missed-gate-do-not-re-tune)), and whether to re-run `bravo` Light, Standard and Standard + `playback` unplugged and rested, several takes each, alternating — only Full has been. **Proposed, not built:** a read-only `?debug` line showing the master output's level and whether it is finite, to tell a silent graph from loss after it (audio-adjacent, so it needs his go-ahead).

**Decisions, 2026-09-21 (Crawford), taken after this reading** (recorded in [the spec, §7 J, N, O, P](../specs/AUDIO_LOAD_BUDGET.md#decisions-resolved-2026-09-20-crawford)):
1. **Decision J — deferred.** Standard stays on `interactive` until there is data: a rested, unplugged re-run of Standard vs Standard + `playback`, or a desktop A/B.
2. **Standard's missed gate — accepted and re-set** to what Standard delivers (0.069). Taking the filter LFOs off at Standard stays the recorded lever if a rested re-run shows Standard still failing on `bravo`.
3. **More phone runs — not now.** He may run more if he has the chance.
4. **Master-output diagnostic — approved to build,** the full version: master and pre-chain level, finite check, a silent-while-sounding event and a playback-stats probe, under `?debug` only.

## Phone protocol for the output diagnostic — Crawford's run (plan task 16, prepared 2026-09-21)

The diagnostic is built ([specs/AUDIO_OUTPUT_DIAGNOSTIC.md](../specs/AUDIO_OUTPUT_DIAGNOSTIC.md) §8; how to read it: [PERFORMANCE.md](../PERFORMANCE.md#reading-the-output-taps-and-the-playback-stats)). It exists to answer one question the previous run could not: **when the sound drops out with every earlier overlay reading normal, is it silent inside the graph, or lost after it?**

**Set-up.** Same as the last run: on the PC `npm run build && npx vite preview --host --port 4173`, then `ipconfig` for the IPv4 address. On the Pixel (**Chrome 153**, so `playbackStats` is expected): **unplugged** with at least about 50 % battery, rested, playing through the **phone speaker**, one tab, stopwatch started at the power tap. The overlay is two lines taller than before and its log still holds the last 8 events.

**URLs** — base `http://<pc-ip>:4173/trace-atlas/?debug`, then:

| # | Suffix | Why |
|---|---|---|
| 1 | `&seed=bravo&x=-150&y=90&load=full` | The world and preset that dropped out three times. |
| 2 | `&seed=bravo&x=-150&y=90&load=light` | The preset that was clean: does it stay green, with `underruns` flat? |
| 3 | `&seed=charlie&x=200&y=-30&load=full` | The calm baseline. |

Take as many as you have time for; a run that drops out is worth more than a clean one.

**What to write down, and screenshot at any click or a dropout** — the two new lines and the event log:
- **`out … pre … fin`** — `out` is what the destination receives, `pre` what the voices hand the FX chain. During a silence: `out` at `-inf` (or below −80 dB) means the graph itself is silent — then is `pre` still live (the fault is inside the FX chain) or also silent (upstream)? `out` at a normal level means the graph is fine and the loss is after it.
- **`underruns n (Dms) · lat …`** — does the count **rise while you hear clicks**? That would mean the clicks are output underruns. A flat count during a silence with a normal `out` points downstream of the app.
- **Events** — `master output silent for 3s while notes sound (pre-chain …)`, `playback underruns began/stopped …`, `non-finite samples …`; and whether the border went red.
- If the line reads **`underruns n/a`** on the phone, say so: it would mean the wrapper's private field the reader relies on has moved.

**Crawford's results (2026-09-21, by ear plus 17 screenshots), verbatim, then read plainly.** Each run was one continuous session on the phone; no full silent-graph dropout occurred in any of the three (the event log never showed `master output silent…`, and `out`/`pre` stayed at normal dB levels — never `-inf` — in every screenshot). The distortion he reports is heard, not read off a dropout.

```text
http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=full
8 seconds in or so it started distorting, lasted for a good 20 seconds or so. Then it was ok for
quite a while audio wise, but I did see some red. Lots of red, some clicks around 1:30, and again
at 2:10ish. Lots of red around 2:30. Just always lots of red, and around 3:20 it got badly
distorted until 4:00ish. Around 4:10 it's really clean for like 10 or 15 seconds. By 4:45 it was
distorting alot again

http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=light
One click at 3:06. A few after 3:30. Single clicks at a time though, very light. Screen grabbed
one red right at the end, around 4:40.

http://192.168.12.231:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30&load=full
3 seconds in or so we got a red but i didn't hear a click. 1:06, heard a single click, one or two
more by 1:30. A single click at 2:10. One around 3:03. Had one click during the famous quiet
section around 3:20. Three around 4:52.
```

**Overlay transcription** (mine, from the 17 screenshots — 8 for run 1, 3 for run 2, 6 for run 3, matched by world, `load`, and the overlay's `up` clock):

| Run | Shots (`up`) | `underruns` (start → end) | Longest burst logged | `out` / `pre` range | `lat` |
|---|---|---|---|---|---|
| 1 bravo · full | 0:14 → 5:02 | 78 → **2246** | `stopped after 40.0s (+1434)` (the ~3:20–4:00 storm); `stopped after 15.0s (+319)` (~4:45) | −11…−16 dB / −4…+10 dB, never `-inf` | 22ms (5–24) |
| 2 bravo · light | 3:10 → 4:39 | 2 → **9** | `stopped after 1.0s (+14)` | −12…−16 dB / −5…+11 dB | **266ms (21–309)** |
| 3 charlie · full | 0:46 → 5:04 | 1 → **82** | `stopped after 3.0s (+5)`, `1.5s (+12)` | −11…−19 dB / −18…+10 dB | 25ms (5–28) |

Every shot read `ctx running`, `fin ok`, and the `latency` line confirmed the requested preset (`playback` on Light with `base 21ms`, `interactive` with `base 5ms` on Full).

**Plain reading:**

1. **The clicks are playback underruns.** The browser's own count tracks what he heard and saw as red closely enough to call this settled: run 1 (constant heavy distortion, "always lots of red") reached 2246 underruns with a 40-second, 1434-underrun burst sitting right under his "badly distorted until 4:00ish"; run 3 (occasional single clicks) reached only 82, with the bursts he could time (3:03, ~3:20, 4:52) matching small multi-underrun bursts in the log; run 2 (very light, single clicks) reached only 9. This is the discriminator the diagnostic was built to give, and on this data it comes out clean.
2. **No full dropout this session, on any preset.** All three runs stayed audible throughout — no `-inf`, no silent event, no red for "silence." The earlier `bravo` dropouts (Standard ~4:55, two `bravo` Full takes) may be a rarer failure than the everyday clicking; this run doesn't rule them out, since 3 sessions is a small sample and the log only keeps the last 8 events (an event outside a screenshot's window would not be caught here).
3. **Light is a large, real improvement on `bravo`.** 9 underruns against 2246 over a comparable stretch — roughly a 200×+ difference — for a world where Full was reported as "always lots of red." That is a stronger, more direct confirmation than the desktop capacity numbers gave alone.
4. **`charlie` · Full clicks about as much as `bravo` · Light**, by ear and by count (82 vs 9, but over similar wall time and both "light single clicks") — consistent with the calm world already being close to a phone's budget even without Light's caps (flagged in the 2026-09-20 desktop notes).
5. **Open — the Light latency figure.** `lat` on Light read **266 ms average (21–309 range)**, against ~22–25 ms on both Full runs. `resetLatency()` is never called, so this is the average over the whole run; if one early large value is baked in, it could be pulling the average up rather than reflecting steady-state latency. Not yet explained — worth another Light run to see whether the average settles, and whether `minimumLatency`/`maximumLatency` narrow over time.
6. **What this doesn't answer.** Whether `bravo` still drops out completely under some condition (heat, a longer session, a particular locale event) is untested here — this was three single runs, by ear, with no rest/unplugged discipline recorded for this batch specifically.

## Standard, and decision J — Crawford's follow-up run (2026-09-21, same session, `bravo` only)

Two more runs, back to back with the three above, to answer the missed Standard gate and decision J directly with underrun counts rather than render capacity.

```text
http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=standard
Two audible clicks around 0:30. Got a couple of clicks at 2:15ish. Got a few around 3:00 and again
at 3:15. Lot's of red around 3:55. Clicking becoming pretty regular since then. Long red one at
the end there, 22 seconds.

http://192.168.12.231:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&load=standard&latency=playback
I heard 2 or 3 clicks between 2:00 and 2:10, but by 2:20 they started getting regular til 2:40.
2:50 they started coming back. Then it was just minor clicks til 4:10. At 4:30 it started picking
up again.
```

**Overlay transcription** (18 screenshots — 11 for Standard, 7 for Standard + `playback`):

| Run | Shots (`up`) | `underruns` (start → end) | Longest burst logged | `lat` |
|---|---|---|---|---|
| Standard (`interactive`) | 0:40 → 5:13 | 2 → **1227** | `stopped after 22.0s (+557)` at 5:12 — his "long red one … 22 seconds" | 22–25ms (5–28) |
| Standard + `playback` | 2:12 → 5:03 | 4 → **186** | `stopped after 7.0s (+35)` at 3:03 | **266ms (21–309)**, unchanged across all 7 shots |

**Ranking on `bravo` over a comparable ~5-minute stretch, fewest underruns to most:** Light **9** ≪ Standard + `playback` **186** ≪ Standard (`interactive`) **1227** ≪ Full **2246**.

**Decision J is answered: `playback` helps Standard by a lot, on `bravo`.** 186 underruns against 1227 — about 6.6× fewer — for the same preset, same world, same session, only the latency hint different. Standard on `interactive` is closer to Full than to Light; Standard with `playback` sits meaningfully closer to Light, though still roughly 20× worse than Light itself. This is the first head-to-head, same-session comparison of the two hints at Standard, and it favours `playback` clearly.

**The Light-latency question from the earlier run is resolved, not just narrowed.** `lat 266ms (21–309)` was flagged as unexplained and possibly an early-value artifact skewing the average. It is not: the exact same figure — `266ms (21–309)`, to the millisecond — appears across all 7 screenshots of this run and all 3 of the earlier `bravo` · Light run, from two separate page loads with fresh `AudioContext`s. That rules out a stale reading or a one-off spike: the `playback` latency hint on this phone produces a **real, repeatable ≈266 ms average output latency** (min 21 ms, matching the requested 21 ms buffer; max 309 ms), a long way past the ~22–25 ms this phone reports under `interactive`. `playback` is winning on underruns while costing a large, consistent latency penalty — for this app (a generative soundscape, not something played to a beat the user taps along to) that trade is probably the right one, but it is a real cost, not a rounding error.

**Not yet known:** whether `charlie` (the calm world) shows the same Standard-vs-`playback` gap, or whether it's `bravo`-specific like the earlier LFO-driven load was.

**Decision made (2026-09-21):** Crawford accepted this data as sufficient — the effect size (6.6×) is well past the noise seen elsewhere in this project, and the ~266 ms latency cost is the same one Light already ships unremarked. **Standard now ships with `playback`** (`LOAD_PLAYBACK_BELOW` 0.4 → 0.61, commit `6e8910c`; spec decision J, [AUDIO_LOAD_BUDGET.md](../specs/AUDIO_LOAD_BUDGET.md) §7). `charlie` remains untested for this pairing.

**Confounder note:** Crawford let the phone cool between takes for this batch (unlike the first phone A/B, run back to back). That doesn't fully control for it — there's no explicit before/after temperature or battery reading recorded — but it removes the sharpest objection to the earlier inconclusive A/B, and is part of why this comparison was trusted enough to resolve decision J.

## Baseline for the Audio Palette series (roadmap 50) — Crawford's run, 2026-10-13

The reference every 50.x sub-phase A/Bs against, measured on `main` at `ca2b6868` (Robot Pan merged,
chain `EQ3 → LPF → HPF → Delay → Reverb → Compressor → Limiter`, nothing from 50.x yet). Pixel 8,
Chrome 153, `?debug` on, the local Vite preview build.

**The world:** Crawford's "go to for testing now" — the share link's `?session=` payload, decoded:
seed `alpha`, camera `x 0, y 50`, every global setting at its default (Natural Decay; reverb decay 1.5
/ preDelay 0.02 / wet 0.3; delay 0.25 / feedback 0.2 / wet 0.15; compressor −24 dB / 2:1 / 3 ms /
250 ms / knee 6; EQ3 flat; LPF 20 kHz Q 1; HPF 20 Hz Q 1; limiter −12). Append `?debug&session=` and the
payload below to the preview URL:

```
eyJ2IjoyLCJuIjoiYWxwaGEiLCJjIjp7IngiOjAsInkiOjUwfSwiZyI6eyJjb21wcmVzc29yQmVmb3JlRGVsYXkiOmZhbHNlLCJyZXZlcmIiOnsiZGVjYXkiOjEuNSwicHJlRGVsYXkiOjAuMDIsIndldCI6MC4zfSwiZGVsYXkiOnsiZGVsYXlUaW1lIjowLjI1LCJmZWVkYmFjayI6MC4yLCJ3ZXQiOjAuMTV9LCJjb21wcmVzc29yIjp7InRocmVzaG9sZCI6LTI0LCJyYXRpbyI6MiwiYXR0YWNrIjowLjAwMywicmVsZWFzZSI6MC4yNSwia25lZSI6Nn0sImVxMyI6eyJsb3ciOjAsIm1pZCI6MCwiaGlnaCI6MH0sImZpbHRlckxQRiI6eyJ0eXBlIjoibG93cGFzcyIsImZyZXF1ZW5jeSI6MjAwMDAsIlEiOjF9LCJmaWx0ZXJIUEYiOnsidHlwZSI6ImhpZ2hwYXNzIiwiZnJlcXVlbmN5IjoyMCwiUSI6MX0sImxpbWl0ZXIiOnsidGhyZXNob2xkIjotMTJ9fX0=
```

| Run | Length | `underruns` (start → end) | By ear |
|---|---|---|---|
| Full | 3:00 | 0 → **0** | clean throughout |
| Standard | — | *not yet run* | — |

**How a sub-phase uses it:** same link, same length, same phone, Full and Standard, on the sub-phase's
branch with the new control at its seeded default and again at its loudest setting. The number to beat
is zero at Full: any underrun the branch adds is the signal the umbrella's gate (roadmap 50, "Without
distortion") is written for, and the feature ships behind a new `LOAD_*_MIN` threshold or not at all.
Re-baseline here whenever `main` changes the chain between sub-phases.

## Robot Articulation (roadmap 50.1) on the Pixel — Crawford's report, 2026-10-13

Branch `feature/palette-articulation`, the same seed-`alpha` world as the baseline above. What Crawford reported, in his
words: at 90 seconds "no distortion or underruns"; at three minutes "pixel is good, no distortion after 3 minutes"; and
later "PHONE PASSED - SEVERAL MINUTES ON FULL AUDIO QUALITY with no distortion." Nothing more was given, so this records
what was and was not said:

| Run | Length | `underruns` | By ear |
|---|---|---|---|
| Full | "several minutes" (no exact length given) | no count given | no distortion |
| Earlier run, mode **not stated** | 1:30, then 3:00 | no count given (90 s: none reported) | no distortion |
| Standard | — | *not reported* | — |

**Not recorded, so not claimed:** the HUD underrun numbers, an exact run length for Full, a Standard run, the Effects Limit
check below 0.4, and the desktop `npm run perf` before and after. The series gate is zero underruns at Full, and a run with
no distortion on Full is consistent with it without proving it by number. T14b's `LOAD_BUS_FILTER_LFOS_MIN` (0.8) was built before any rise was reported;
on this evidence the bus links did not need it, and the value is a placeholder (roadmap 50.1, "As built").

## Robot Sends (roadmap 50.2) on the Pixel — Crawford's report, 2026-10-14

Branch `feature/palette-sends` at Checkpoint C (T1–T17 committed), the same seed-`alpha` world as the baseline above. What
Crawford reported, in his words: "phone checks both passed, no distortion at all for three minutes on both runs on the
phone". Read against the plan's two runs (docs/tasks/ROBOT_SENDS.md Task 18), that is Full for 3:00 and Standard for 3:00.
Nothing more was given, so this records what was and was not said:

| Run | Length | `underruns` | By ear |
|---|---|---|---|
| Full | 3:00 | no count given | no distortion |
| Standard | 3:00 | no count given | no distortion |

**Not recorded, so not claimed:** the HUD underrun numbers for either run, and the desktop `npm run perf` before and after.
Crawford chose to skip the perf comparison (2026-10-14), so the "no long-task regression" criterion of T18 was not checked.
The gate is zero underruns at Full and no more than the Standard baseline; two clean-sounding runs are consistent with it
without proving it by number. No `LOAD_*_MIN` threshold was added for the sends (intent: a rise would be a wiring bug or a
reason to back out), and on this evidence none was needed.

## Global Colour (roadmap 50.3) on the Pixel — Crawford's report, 2026-10-15

Branch `feature/palette-colour` at Checkpoint C (T1–T11 committed, HEAD `e07074ce`). What Crawford reported, in his words:
"phone 3 minuts on full settings - no clipping, we're good", and, asked for the HUD underrun count, "no underruns". Nothing
more was given, so this records what was and was not said:

| Run | Length | `underruns` | By ear |
|---|---|---|---|
| Full | 3:00 | none reported (a verbal "no underruns"; no start → end HUD numbers given) | no clipping |
| Standard | — | *not reported* | — |

**Not recorded, so not claimed:** which world the run used (the seeded character, Bit Crusher alone at full Mix and 4 bits,
or all three effects at full Mix: the plan's runs a, b and c, docs/tasks/GLOBAL_COLOUR.md Task 12), the HUD underrun numbers,
a Standard run, the T0 re-baseline on current `main` (the Baseline section above still predates Robot Sends), and the
desktop `npm run perf` before and after. The gate is zero underruns at Full and no more than the Standard baseline. One
clean Full run is consistent with it; it only proves the worklet-cost question if it was run (b) or (c), and that is not
known. No `LOAD_COLOUR_MIN` threshold (T13b) was built: nothing reported a rise.

## Global Modulation (roadmap 50.4) on the Pixel — Crawford's report, 2026-10-15

Branch `feature/palette-modulation` after T13 (HEAD `9dc21331`). What Crawford reported, in his words: "three minutes on
full settings and while there were some underruns there wasn't any distortion", and, asked which run it was, "both pedals
on, 12 stages, full, it was fine". Nothing more was given, so this records what was and was not said:

| Run | Length | `underruns` | By ear |
|---|---|---|---|
| (c) Both pedals at full Mix, 12 stages, Full | 3:00 | *some*, count not given (no start → end HUD numbers) | no distortion, "fine" |
| Standard | — | *not reported* | — |

**Not recorded, so not claimed:** which world the run used, the HUD underrun count, a Standard run, the T0 re-baseline on
current `main` (T0 was not run; the Baseline section above still predates Robot Sends and Colour), the plan's runs (a)
the seeded pedals and (b) Phaser alone, and the desktop `npm run perf` before and after
(docs/tasks/GLOBAL_MODULATION_COLOUR.md Task 14).

**Reading against the gate.** The gate is zero underruns at Full and no more than the baseline's count at Standard. "Some
underruns" at Full does not meet the first half as written, and with no baseline it cannot be said whether the pedals
raised the count: run (c) is the worst case the plan names, so a clean ear on it is encouraging, not a pass. Nothing is
changed on this evidence: the Stages ceiling stays at 12 and `LOAD_PEDAL_MIN` (T15b) is not built. What would settle it
is the same world run on `main` (T0) and the HUD's count from this branch's run, both at Full 3:00.

## Global Pedals (roadmap 50.6) on the Pixel — T0 and T14, Crawford's runs, 2026-10-19

T0 and T14 of docs/tasks/GLOBAL_PEDALS.md, run back to back in one sitting. T0 is `main` at `d29ac778`, served on port
4173. T14 is `feature/pedals` at `f0ddc8eb`, served on port 4174. Both are local Vite preview builds on the LAN, on the
Pixel 8 with `?debug`. Each link opens a fresh page, so each run starts from a new AudioContext. The world is the
seed-`alpha` baseline payload above. The worst case adds, on top of it: all six Modulation pedals at Mix 1 (AutoWah,
Phaser, Chorus, Tremolo, Vibrato, Shifter), Tone's default parameters except Phaser stages 12, Shifter +10 Hz and Width 1.
The tier is chosen with `&load=full` or `&load=standard`. The start count was 0 wherever Crawford wrote none, as agreed.

| # | Build | Tier | World | Length | `underruns` start → end | By ear (Crawford's words) |
|---|---|---|---|---|---|---|
| 1 | main `d29ac778` | Full | baseline | 3:00 | 0 → **36** | "sounded great" |
| 2 | main `d29ac778` | Standard | baseline | 3:00 | 0 → **59** | "some stutter in the first minute, it got a little better in minute 2 but never GREAT. one stutter happened during a solo robot melody." |
| 3 | branch `f0ddc8eb` | Full | worst case | 3:00 | 0 → **92** | "just a little bit stutter throughout, but not nearly as much as i would expect from the volume of underruns." Pedals confirmed lit in the drawer. |
| 4 | branch `f0ddc8eb` | Standard | worst case | 3:00 | 0 → **193** | "some stutter throughout. going through tabs didn't seem to cause an increase in underruns this time." |

**Run 3 kept going past 3:00, in Crawford's words:** "around 3:30 i started looking at the drawers to make sure
everything was lit, and underruns with distortion took off, around 1600 by 4:15. once they started piling up they don't
seem to ever slow down again, even if i go back to the deck view. at 6:00 we're at 3058. around 6:20 I turned the power
off and back on, and it was still very distorted. 4730 at 7:00."

**Reading against the gate.** As written, the gate is zero underruns at Full and no more than T0's count at Standard.
`main` itself no longer meets the first half: 36 at Full, where the 2026-10-13 baseline on `ca2b6868` read 0. So the
branch is read against `main`. Full went from 36 to 92 (about 2.6×) and Standard from 59 to 193 (about 3.3×). **T14
misses.** Each figure is a single run, with no repeat to show the spread. On both builds Standard counted more than Full
in this sitting.

**The runaway after 3:30 on run 3 is a separate finding.** The count went from about 1 600 to 4 730 over about three
minutes. It did not recover in the deck view, nor after a power-off and power-on (power-off does not close the
AudioContext, and the global chain keeps processing). Nothing here says whether `main` does the same when the drawers
are browsed, or whether the cause is the pedals, the drawer render or heat. Run 4 browsed tabs without a rise.

**Not yet recorded:** the bisect, the idle cost of the dark pedals, a drawer-browsing control on `main`, and the desktop
`npm run perf` before and after.

**Round 2, the same sitting.** The plan's bisect was replaced by three runs that separate the causes. A is the branch with
the baseline link, so every new pedal is dark. B is `main` with the baseline link, hands off to 3:00, then browsing the
drawers. C1 is the branch with the Chorus alone at Mix 1. All three are Full. Crawford stopped after C1, since A already
answered the question (C2–C4 were not run).

| # | Build | World | `underruns` at 3:00 | After 3:00 (Crawford's words, shortened only where marked …) |
|---|---|---|---|---|
| A | branch `f0ddc8eb` | baseline, every new pedal dark, hands off | 0 → **380** | "some stutter, but overall not TOO bad. barely acceptable. unerruns DOUBLED in the last 10 seconds. by 3:20 there were at 900. i didn't touch anything. lots of distortion, it's bad. at 3:45 we're at 1845. at 4:00 we're at 2502. at 4:05 it started completely dropping out. at 4:20 it turned silent. log says "4:42 main thread stalled -746ms" i still haven't touched aything. around 5:15 music started playing again, still pretty distorted." |
| B | main `d29ac778` | baseline, drawers browsed after 3:00 | 0 → **94** | "barely any stutter. looking through tabs was completely fine, no underrun spikes or anything. at 4:00 we're at 112." |
| C1 | branch `f0ddc8eb` | baseline + Chorus alone at Mix 1, hands off | 0 → **360** | "some stutter, but overall not TOO bad. acceptable. unerruns DOUBLED in the last 10 seconds again. by 3:20 there were at 880. … at 3:45 we're at 1800. at 4:00 we're at 3200. at 3:50 it started completely dropping out. at 4:00 it turned silent. log says "4:06 audio clock stalle (x0.47)" and "4:07 audio clock recovered after .6x" and "4:33 main thread stalled -770ms" and then several more main thread stalled notes, about every 5 seconds. i still haven't touched aything. 6:15 in and the music still hasn't started back up." |

**What round 2 shows.** The runaway is the branch's, not the drawers' and not the phone's. B ran between A and C1 in the
same sitting and stayed clean through drawer browsing. A and C1 collapsed hands-off at about 2:50. Lighting a pedal adds
little: C1 matches A, and the worst case read 92 at 3:00. On these single runs, the cost is the pedals' presence, not
their Mix. That agrees with Tone 15's `Effect`: the effect path keeps running behind the CrossFade at any `wet`, and the
browser does not skip a node whose output is faded to zero. Once the phone tipped over, it did not recover: the same
one-way collapse seen on `bravo` at Full (2026-09-21). **Outcome:** T15b, a Mix threshold, would not help, since Mix 0
already costs the full price. Crawford chose (2026-10-19) to take a dark effect out of the signal path for all ten
effects (the five pedals, plus the AutoWah, Phaser and three Colour effects already on `main`). A desktop measurement
of each effect's dark cost comes first.

## Dark-Effect Bypass, desktop baselines — T0, 2026-10-19

Task 0 of docs/tasks/DARK_EFFECT_BYPASS.md: the "before" numbers that spec §5 steps 3 and 4 compare the cells against.
Nothing in the product was changed to take them. **Code measured:** branch `feature/pedals` at `47ce45d3` (clean product
tree; only untracked docs) and `main` at `d29ac778` (the clean worktree from round 2). Both were production builds
(`vite build --outDir` into this session's scratchpad). They were served side by side by one `vite preview` on port 4173,
with `main` as `main.html` beside the branch's `index.html`. Only the main script chunk differed; every other asset was
byte-identical. The stale previews on ports 4173 and 4174 were stopped first.

**(a) Render capacity, `npm run perf:audio`.** The world is round 2's run A link: the seed-`alpha` baseline payload,
so every new pedal is dark, with `load=full`. One deviation from the recipe: the script's `name:x:y` writes `?seed=`,
which the app no longer reads, so the world was pinned by a `session=` query appended to each spec
(`alpha:0:50?load=full&session=…` and `alpha:0:50@main.html?load=full&session=…`). The HUD read `0,50` on both pages,
which confirms the payload's locale. Its seed field reads `random` because it shows the retired `?seed=` override, not
the session's world. Three interleaved rounds, start order rotated (branch, main, branch first), 240 s series, 15 s
buckets, 8 s warm-up, two runs per foreground call, nothing else running. The orphaned-Chrome count was 0 before and
after every call.

| Round | Branch mean | Branch peak window | `main` mean | `main` peak window | Branch − `main` (mean) |
|---|---|---|---|---|---|
| 1 | 0.716 | 0.844 | 0.448 | 0.528 | +0.268 |
| 2 | 0.553 | 0.708 | 0.468 | 0.574 | +0.085 |
| 3 | 0.602 | 0.704 | 0.449 | 0.609 | +0.153 |
| **Average** | **0.624** | **0.752** | **0.455** | **0.570** | **+0.169** |

The overall max was 0.991–0.997 on every run, the usual single-poll spikes. `main` is steady (means 0.448–0.468).
The branch is higher in every round and much less steady (0.553–0.716). So on the desktop, too, five more dark effects
cost the audio thread about 37 % more on average (0.624 against 0.455), with nothing lit. Spec §5 step 3's gate for after the cells is
branch ≤ `main` on this same A/B.

**(b) Main thread, the hang probe over CDP.** The recipe from GLOBAL_PEDALS.md §8 (Checkpoint A fix): `vite` dev
server on port 5199, headless Chrome on port 9377, click Power on, poll the page with a 1.5 s timeout. Then, through
the store: a Decay flip (`setCompressorBeforeDelay(true)`), a Phaser Stages change, and all seven global LFO targets
unlinked and relinked. The world is the baseline payload plus the Chorus and Tremolo blocks from the 2026-10-19
single-pedal links, both at Mix 1. The probe read both back from the store as Mix 1 after power-on (Vibrato 0,
Natural Decay). One warm-up load was discarded, then three runs:

| Run | Power-on | Unresponsive | Decay flip | Phaser Stages | Seven LFO links |
|---|---|---|---|---|---|
| 1 | 1 375 ms | 0 ms | 3 ms | 31 ms | 1 ms |
| 2 | 1 385 ms | 0 ms | 2 ms | 28 ms | 1 ms |
| 3 | 1 166 ms | 0 ms | 2 ms | 26 ms | 1 ms |

The power-on time resolves to about 0.1–0.2 s, since that is the probe's poll interval. These sit under the
2026-10-18 figures in GLOBAL_PEDALS.md §8 (about 2 s, 3–4 ms, about 40 ms, 1 ms), measured in another session.
T13 should compare against this table, or re-run this baseline in its own session if the numbers look drifted.
Aside, from the single plumbing check on the production builds (baseline link, one run each, not a measurement): the
branch powered on in 1.1 s with 0 ms unresponsive, and `main` in 2.5 s with 1.5 s unresponsive. That fits `main`
lacking the cycle-search cuts.

**(c) The dark-cost probe folder still exists** at the path in spec §5 (`dark-cost/` with `index.html`, `probe.js`
and the `node_modules` junction, plus `dark-cost-drive.mjs` and `dark-cost-5r.json`). T12 can re-run it rather than
rebuild it.

This session's files, in its scratchpad
`C:/Users/Crawford/AppData/Local/Temp/claude/c--Code-Fallboard-Studios-The-Still-Echo-pelagos-7/ead4402b-820a-4dd2-bbbf-db766ff79614/scratchpad/t0/`:
`site/` (the side-by-side build), `round1.json`–`round3.json`, `baseline.txt` and `two-lit.txt` (the payloads,
written by `payloads.mjs`), and `probe.mjs` (the hang probe, plus `HUD=1` and a restored-values read-out). No server
was left running.

## Dark-Effect Bypass, desktop after — T12, 2026-10-20

Task 12 of docs/tasks/DARK_EFFECT_BYPASS.md: the dark cost with every effect in its bypass cell, against T0 above.
**Code measured:** branch `feature/pedals` at `1421c023` (the cells, T1–T11 and the Phaser Stages duck; clean product
tree) and `main` at `d29ac778` (T0's build, reused unchanged). **Both gates pass.**

**(a) The dark cost, per effect.** The 2026-10-19 probe (raw Tone 15.1.22 in headless Chrome, a 30 s OfflineContext
render of a sawtooth/square stereo source, timed against a source-only render; extra render ms per audio second, i.e.
‰ of one desktop core; 5 interleaved rounds, medians), extended with the cell exactly as `buildGlobalFxChain` builds
it. That is `in` → `dry` → `cut` and `wet` (0) → `cut`, with a zero-delay `Tone.Delay` at `CHAIN_CUT_OPTIONS`, and the
effect pinned at `wet 1` (the widener at width 0.5), built and started but not connected. Two reference rows were
re-run in the same sitting, the old build's ten inline at their dark settings and the ten built but disconnected, to
show the probe still sees the cost. The first two columns are the 2026-10-19 table from
[docs/intent/dark-effect-bypass.md](../intent/dark-effect-bypass.md).

| Effect | 2026-10-19: dark, in the chain | 2026-10-19: dark, disconnected | **2026-10-20: dark, in its cell** |
|---|---|---|---|
| Phaser (10 stages) | 57 | 5.5 | **5.2** |
| AutoWah | 32 | 3.8 | **2.7** |
| FrequencyShifter | 23 | 4.5 | **3.8** |
| Chorus | 19 | 5.0 | **5.1** |
| Tremolo | 17 | 7.6 | **5.2** |
| StereoWidener (0.5) | 14 | 4.4 | **4.0** |
| BitCrusher | 13 | 6.4 | **5.4** |
| Vibrato | 11 | 3.3 | **3.0** |
| Chebyshev | 7 | 0.7 | **1.0** |
| Distortion | 6 | 0 | **1.0** |
| One empty cell | — | — | **0.5** |
| Ten empty cells | — | — | **4.8** |
| **All ten** | **213** | **48** | **38.3** (rounds 35.1–39.6) |

Same-sitting references: the ten inline **150.6** (149.5–157.6) and the ten disconnected **32.4** (30.1–33.0); baseline
render 138 ms (134–191). **Gate (assumption 14): all ten dark in cells ≤ 70 ‰ — PASS at 38.3.** This sitting ran
about 0.7× the 2026-10-19 one (150.6 / 213 = 0.71, 32.4 / 48 = 0.68). Scaled to that sitting, the cells would be
about 54 ‰, which still passes. The cells save 75 % against the inline build in the same sitting (38.3 against
150.6). Ten cells cost what disconnecting costs plus ten empty cells (32.4 + 4.8 = 37.2 against 38.3 measured), so
the topology itself is about 0.5 ‰ per effect. What remains is the effects' own LFOs, constant signals and the
BitCrusher's worklet, which only disposing them would reach (spec assumption 10). Orphaned headless Chrome: 0 after.

**(b) Render capacity, `npm run perf:audio`.** T0's recipe and world: the seed-`alpha` baseline payload (every new
pedal dark), `load=full`, pinned with `alpha:0:50?load=full&session=…` and `alpha:0:50@main.html?load=full&session=…`
on one `vite preview` (port 4173) serving the branch's fresh build as `index.html` and T0's `main` build as `main.html`.
240 s series, 15 s buckets, 8 s warm-up. Three interleaved rounds, start order rotated as in T0 (branch, main, branch
first). One world per foreground call (T0 ran two per call); nothing else running. Orphaned-Chrome count 0 before and
after every call.

| Round | Branch mean | Branch peak window | `main` mean | `main` peak window | Branch − `main` (mean) |
|---|---|---|---|---|---|
| 1 | 0.430 | 0.506 | 0.451 | 0.514 | −0.021 |
| 2 | 0.435 | 0.502 | 0.451 | 0.538 | −0.016 |
| 3 | 0.428 | 0.500 | 0.478 | 0.687 | −0.049 |
| **Average** | **0.431** | **0.502** | **0.460** | **0.580** | **−0.029** |
| T0 (2026-10-19) | 0.624 | 0.752 | 0.455 | 0.570 | +0.169 |

**Gate (spec §5 step 3): branch ≤ `main` on mean and peak window — PASS, in every round.** `main` reproduced T0
(0.460 / 0.580 against 0.455 / 0.570). The branch fell from 0.624 to 0.431, now below `main`: `main`'s own five dark
effects (Distortion, Chebyshev, BitCrusher, AutoWah, Phaser) are inline at wet 0, while the branch's are in cells. The
branch is also the steadier of the two (means 0.428–0.435 against 0.451–0.478). The overall max was the usual
single-poll spike: 0.99 on every branch run and on `main`'s round 3 (0.84 on its rounds 1 and 2). Buckets with a max
above 0.8 were scattered across both builds: branch 2 / 2 / 1, `main` 2 / 1 / 5.

This session's files, in its scratchpad
`C:/Users/Crawford/AppData/Local/Temp/claude/c--Code-Fallboard-Studios-The-Still-Echo-pelagos-7/5bf05dc0-cd58-45f6-9633-c813096c5fe6/scratchpad/t12/`:
`dark/probe.js` (the cell probe; serve with `npx vite <dark> --port 5199` from the repo), `drive.mjs`, `dark-5r.json`,
`site/` (the side-by-side build), `perf.sh` (one world per call), `r1`–`r3-branch|main.json` and `.log`. No server was
left running.

## Dark-Effect Bypass, main thread after — T13, 2026-10-20

Task 13 of docs/tasks/DARK_EFFECT_BYPASS.md: power-on, a Decay flip and one Mix crossing on the main thread, against
T0's (b) above. **Code measured:** branch `feature/pedals` at `75f1a5d1` (the cells, T1–T12; clean product tree) and,
in the same sitting, T0's own build `47ce45d3` (a detached worktree in the scratchpad). Re-running the "before" in
this session replaced the cross-session comparison that T0 warned about. Both ran as `vite` dev servers, the branch
on port 5199 and `47ce45d3` on 5198. The worktree's server allowed the repo's `node_modules` (its junction target), so
it loads the same fonts. The probe and world are T0's: the hang probe on Chrome port 9377, and T0's `two-lit.txt`
payload (the baseline world plus the Chorus and Tremolo at Mix 1) with `&debug`. Every run read Chorus 1, Tremolo 1,
Vibrato 0, Phaser 0 (10 stages) and Natural Decay back from the store. The HUD read `fx in 2/10` on the branch. One
warm-up load per server was discarded, then three interleaved rounds (branch first, `47ce45d3` first, branch first),
one probe per foreground call, nothing else running. The orphaned headless-Chrome count was 0 before and after every
call. **Every figure is within its bar.**

**The crossing.** With a CDP trace running (the `toplevel` and `devtools.timeline` categories) and Tone's context
`setTimeout` wrapped, each callback stamps the trace with the label of the write that armed it and times itself.
The Vibrato goes Mix 0 → 0.3 (light), then 1 s later 0.3 → 0 (darken). The write's task is the trace's `RunTask`
that encloses its `console.timeStamp`. The darken's disconnect is the one context-timer callback the darken write arms.
`getConnectedEffectCount()` read 2 → 3 → 2 in every branch run, so each graph change happened.

| Run | Light: write task | Darken: write task | Disconnect: own time | Disconnect: enclosing task | Disconnect fired after the write | Quiet window's longest task |
|---|---|---|---|---|---|---|
| Branch 1 | 0.49 ms | 0.43 ms | 0.1 ms | 7.94 ms | 198 ms | 8.80 ms |
| Branch 2 | 0.57 ms | 0.41 ms | 0.4 ms | 1.88 ms | 167 ms | 8.95 ms |
| Branch 3 | 0.75 ms | 0.34 ms | 0.5 ms | 0.88 ms | 182 ms | 9.69 ms |
| `47ce45d3` 1 | 0.31 ms | 0.21 ms | — | — | — | 9.92 ms |
| `47ce45d3` 2 | 0.37 ms | 0.44 ms | — | — | — | 11.59 ms |
| `47ce45d3` 3 | 0.43 ms | 0.21 ms | — | — | — | 56.05 ms |

**Gate: one crossing ≤ 2 ms — PASS.** The light write is at most 0.75 ms. That is about 0.2–0.3 ms more than the
pre-cell write, which only ramped `wet`. That fits `connectEffect`'s two native connects, but it was not profiled
further. The darken write is
at most 0.43 ms, and the disconnect callback itself at most 0.5 ms. The disconnect fires 167–198 ms after the write,
where the code arms it at lookAhead 0.1 + ramp 0.05 + margin 0.01 = 160 ms, and Tone's ticker adds the rest. The
ticker task it runs in was up to 7.94 ms. That task is the ticker's own scheduling work: tasks of 8.8–9.7 ms occur in
a 400 ms window with no write at all. The longest task in the 400 ms after each write was 7.9–12.5 ms on the branch
and 3.9–60.3 ms on `47ce45d3`, which is that background, not the write. The 56–60 ms in `47ce45d3`'s round 3 was in its
quiet window too.

**Power-on and the rewires** (same runs; times in the page by `performance.now()`, as T0, now to 0.1 ms):

| Run | Power-on | Unresponsive | Decay flip | Phaser Stages (dark) | Seven LFO links |
|---|---|---|---|---|---|
| Branch 1 | 897 ms | 0 ms | 1.8 ms | 16.6 ms | 0.8 ms |
| Branch 2 | 815 ms | 0 ms | 2.1 ms | 16.4 ms | 0.9 ms |
| Branch 3 | 1 144 ms | 0 ms | 1.8 ms | 19.7 ms | 1.4 ms |
| `47ce45d3` 1 | 1 014 ms | 0 ms | 2.5 ms | 20.9 ms | 0.8 ms |
| `47ce45d3` 2 | 899 ms | 0 ms | 2.1 ms | 18.1 ms | 0.7 ms |
| `47ce45d3` 3 | 1 375 ms | 0 ms | 1.6 ms | 22.8 ms | 1.3 ms |
| T0 (2026-10-19, `47ce45d3`) | 1 166–1 385 ms | 0 ms | 2–3 ms | 26–31 ms | 1 ms |

**Gate: power-on no slower than T0 — PASS** (branch 815–1 144 ms, mean 952, against 899–1 375, mean 1 096, in the same
sitting and 1 166–1 385 at T0). The probe's poll resolves power-on to about 0.1–0.2 s, so the builds are level within
that; the ten extra cut Delays the plan named as a risk do not show. **Gate: a Decay flip ≤ T0 — PASS** (branch
1.8–2.1 ms against 1.6–2.5 in the same sitting and 2–3 at T0), so the per-cell cut does not show either. The Phaser
Stages change is not gated. It is dark in this world, so it rebuilds at once, and on the branch the rebuild touches
only its cell (T7): 16.4–19.7 ms against 18.1–22.8. Both builds' rewires armed 14 context-timer callbacks of at most
0.2 ms each.

This session's files, in its scratchpad
`C:/Users/Crawford/AppData/Local/Temp/claude/c--Code-Fallboard-Studios-The-Still-Echo-pelagos-7/2bd86fab-5629-4ca0-b2e3-10ff790a83f3/scratchpad/t13/`:
`probe.mjs` (T0's probe plus the traced crossing), `run.sh` (one run per call, with the Chrome count),
`r1`–`r3-branch|before.json`, `two-lit.txt` / `session.enc` (T0's payload), and `vite.t13.config.mjs` (the
worktree's config, copied out). Both servers were stopped and the worktree removed after the runs.

## Dark-Effect Bypass on the Pixel — round 3 (T14), Crawford's runs, 2026-10-20

T14 of docs/tasks/DARK_EFFECT_BYPASS.md. `main` at `d29ac778` was served on port 4173 (the round-2 worktree,
rebuilt). The branch `feature/pedals` at `2ef8a4e8` was served on port 4174; its product code is the same as at
`75f1a5d1`, the T13 build. Both were Vite preview builds on the LAN, on the Pixel 8 with `?debug`. The links page
`phone-gate.html` gave a fresh page per run, hands off to 3:00, then watched to 4:00. The worlds:
- The seed-`alpha` baseline payload of rounds 1 and 2, every new pedal dark.
- A fresh seeded world, found by cycling seeds.
- The round-1 worst-case payload (all six Modulation pedals at Mix 1, Phaser 12 stages, Shifter +10 Hz, Width 1), loaded from a link rather than set by hand.

Before the runs, each branch link was loaded headlessly on the desktop and read `fx in` 0/10 (baseline, Full and
Standard), 2/10 (the unused fallback) and 7/10 (worst case). The run order is the table's order, as reported.

| # | Build | Tier | World | `fx in` | `underruns` start → 3:00 → 4:00 | Crawford's words |
|---|---|---|---|---|---|---|
| main 1 | `main d29ac778` | Full | baseline | — | 0 → **48** → **75** | "Sounded good throughout." |
| 1 | branch | Full | baseline | 0/10 | 0 → **31** → **54** | "Second attempt. First one, the phone was still hot and at 2:30 the underruns took off, never to stop growing (like from 2K or so underruns at 3:00, 11642 at 4:00). This time, things sounded good throughout." |
| 2 | branch | Full | fresh seed | 4/10 | 0 → **259** → **1 600** | "got some scratching right at 30 seconds. Barely acceptable run, i'd say. At 3:30 underruns shot up, there was only about 300 then suddenly there was a ton." |
| 3 | branch | Full | worst case | 7/10 | 0 → **172** → **957** | "occasional scratch, but sounds pretty good. Got a little scratch around 3:30, then the underruns started taking off. 300ish underruns at 3:30" |
| 4 | branch | Standard | baseline | 0/10 | 0 → **48** → **67** | "Sounded ok, just a little bit scratchy throughout." |

**Reading against the gate. T14 misses.**
- **(1) passes on its second attempt.** It read 31 at 3:00 against `main`'s 48 (−35 %, within 25 %) and rose by 23 from 3:00 to 4:00, against `main`'s 27. By a literal reading both builds rose faster in the fourth minute than their three-minute average (`main` 16 → 27 a minute, the branch 10 → 23), so "not accelerating" is read against `main`. Round 2's run A, the same world before the cells, read 380 at 3:00 and collapsed: the cells fixed the dark-pedal runaway that round 2 found, on a cool phone. **The first attempt ran away** on what Crawford calls a still-hot phone: it took off at 2:30, reached about 2 000 at 3:00 and 11 642 at 4:00.
- **(2) misses:** 259 at 3:00 is 5.4× `main`, and it took off at 3:30, from about 300 to 1 600 by 4:00. The seed lit 4 effects, not the plan's 2 or 3. Which four was not recorded.
- **(3) misses on its one criterion** (does not run away): 172 at 3:00 is not gated, but it took off at about 3:30, from about 300 to 957 by 4:00.
- (4), Standard on the baseline, is recorded: 48 → 67. That is more than Full's 31 in the same sitting, as in round 1.

**What round 3 shows, on single runs.**
- With every effect dark, the branch is now at or below `main` on a cool phone, matching the desktop (T12).
- With effects lit, it is not. Four lit gave 8× the dark count at 3:00 and a runaway at 3:30; seven lit ran away at the same time. Rounds 1 and 2 had suggested lighting costs little (C1 with the Chorus matched A), but that was measured with every effect still inline. With the dark ones gone, the lit ones' own cost is what shows. The bypass only removes dark effects, so a teardown of dark effects (spec assumption 10, the plan's named lever) would not reach runs 2 and 3.
- `main` ran first, on the coolest phone, and has not run away in any round. Round 2's B stayed clean after A's collapse, but that is one run.
- No run here separates heat from load. The first run 1 ran away on a hot phone with nothing lit.

## What a lit effect costs, and the cheaper versions — desktop, 2026-10-20 (after round 3)

Crawford asked whether, short of capping how many effects can be lit, cheaper versions of the effects exist. This
desktop probe prices them; nothing in the product changed. **Method:** T12's dark-cost probe, with each effect
**lit**: raw Tone 15.1.22 in headless Chrome, a 30 s `OfflineContext` render of the sawtooth/square stereo source, timed
against a source-only render. The figure is extra render ms per audio second, i.e. ‰ of one desktop core, the median
of 5 interleaved rounds (min–max in brackets). Each effect sits in a lit cell as `buildGlobalFxChain` builds one (`in`
→ `dry` → `cut`, `in` → effect (wet 1) → `wet` → `cut`, at Mix 0.5's gains), at `DEFAULT_GLOBAL_AUDIO_SETTINGS`, the
widener at 0.7. The orphaned headless-Chrome count was 0 before and after; the phone preview servers sat idle.

**Every effect lit:**

| Effect | Lit, ‰ |
|---|---|
| Phaser (10 stages) | **45.8** (43.9–46.1) |
| AutoWah | **24.9** (24.4–31.4) |
| Chorus | 16.7 (16.0–17.3) |
| Tremolo | 16.1 (14.7–16.4) |
| FrequencyShifter | 15.8 (15.2–16.2) |
| StereoWidener (0.7) | 11.8 (10.4–12.1) |
| BitCrusher | 9.8 (9.6–10.0) |
| Vibrato | 9.8 (9.3–10.0) |
| Chebyshev | 5.9 (5.8–6.4) |
| Distortion | 4.7 (4.5–5.0) |

These sit close to the 2026-10-19 "dark, in the chain" column, as expected: an inline Tone effect does the same work at
any `wet`. So the phone's lit worlds pay the old dark price, but only for the effects that are lit. The Phaser alone
costs about what the four lean pedals cost together.

**Cheaper versions inside Tone** (same sitting):

| Variant | ‰ | Against the default |
|---|---|---|
| Phaser 4 stages | 27.8 (26.5–28.5) | −39 % |
| Phaser 6 stages | 34.0 (32.0–34.3) | −26 % |
| Phaser 8 stages | 39.6 (38.0–39.9) | −13 % |
| Phaser 10 stages (default) | 45.8 | — |
| Phaser 12 stages (the seed's ceiling) | 52.1 (51.7–53.5) | +14 % |
| AutoWah, bandpass −24 dB (2 biquads) | 21.7 (21.5–22.0) | −13 % |
| AutoWah, bandpass −12 dB (1 biquad) | 18.2 (18.0–18.3) | −27 % |
| AutoWah, Tone's −48 dB (4 biquads) | 24.9 | — |

The Phaser costs about 3.1 ‰ per stage on top of about 15.5 ‰ that does not depend on the stage count. The fixed part
is its two Tone LFOs, their scaling and the Q fan-out. Fresh seeds roll 4–12 stages (`globalAudioLoadingRanges.ts`).
The AutoWah's rolloff is fixed at −48 in Tone's constructor; the probe changed it through the private `_bandpass`.

**k-rate filter frequency.** Chrome recomputes a biquad's coefficients every sample while its frequency is driven at
audio rate, as both these effects drive it. With `automationRate = 'k-rate'` it does so once per 128-frame quantum
(2.7 ms at 48 kHz). The app cannot reach this today: Tone builds on standardized-audio-context, whose `AudioParam`
wrapper does not pass `automationRate` through, and the native param sits in a module-private `WeakMap` inside Tone's
bundled deps. So it was priced on plain native nodes shaped like Tone's (a sweep of 350 × 2^(0..3) Hz at 0.5 Hz, Q 10),
against their own source-only render:

| Native shape (both channels) | a-rate ‰ | k-rate ‰ | Saving |
|---|---|---|---|
| Phaser, 4 stages (8 biquads) | 11.2 | 4.6 | −59 % |
| Phaser, 10 stages (20 biquads) | 27.6 | 10.5 | −62 % |
| Phaser, 12 stages (24 biquads) | 33.4 | 12.7 | −62 % |
| AutoWah, 5 biquads | 14.2 | 5.6 | −61 % |
| Phaser, 10 stages, Q driven too: both a-rate / frequency k-rate only / both k-rate | 28.4 | 11.2 / 11.5 | −61 % |

A driven Q does not keep the per-sample path alive, so k-rate on the frequency alone gets the whole saving.
`automationRate` read back as set every time. **Estimates, not measured:** removing the biquads' share and adding the
k-rate price back gives a Tone Phaser at 10 stages of about 29 ‰ (−37 %), and 4 stages + k-rate about 21 ‰ (−54 %). It
gives an AutoWah of about 16 ‰ with k-rate (−35 %), and about 15 ‰ with −12 dB as well (2 of its 5 biquads left).

**What this does not answer:**
- **Whether k-rate is audible.** At the Phaser's seeded 2.5 Hz ceiling the sweep moves up to about 51 Hz per quantum
  near its middle (about 3 % of 1 575 Hz), on Q-10 notches. The AutoWah's follower can sweep 6 octaves fast. Zipper
  noise is possible on both, and only a listen or a measurement of the stepped output can say.
- **Reaching k-rate from the app** would mean patching standardized-audio-context (a new dependency such as
  `patch-package`, which CLAUDE.md says to ask about) or building these two effects outside Tone's wrappers.
- **The phone.** These are desktop ‰. Round 3's runaway world had 4 effects lit, and which ones was not recorded.

## Phaser stages on the Pixel — round 4, Crawford's runs, 2026-10-20

The cheapest option from the pricing above, tried on the phone with no code change: stages ride the session payload.
**Builds:** as round 3, `main d29ac778` on 4173 and the branch (`2ef8a4e8`, product code as `75f1a5d1`) on 4174, Pixel 8,
`?debug`, Full, a fresh page per run, hands off to 3:00, watched to 4:00. **World:** the seed-`alpha` baseline plus four
lit, like round 3's run 2: Phaser, Chorus and Tremolo at Mix 1 and Width 0.7. The runs differ only in Phaser stages, 10
(the default) or 4. The Phaser, Chorus and Tremolo parameters are the worst-case payload's. Order 10, 4, 4, 10 so heat
and order fall evenly, then `main`'s baseline last as the heat control. Before the round, every branch link was loaded
headlessly: `fx in 4/10`, and on a dev server the store read stages 10 or 4, the three pedals at Mix 1 and Width 0.7.
Whether the phone was rested between runs was not reported.

| # | Build | Phaser stages | `fx in` | `underruns` start → 3:00 → 4:00 | Crawford's words |
|---|---|---|---|---|---|
| R4-1 | branch | 10 | 4/10 | 0 → **59** → **69** | "Sounded fine." |
| R4-2 | branch | 4 | 4/10 | 0 → **53** → **110** | "Sounded fine." |
| R4-3 | branch | 4 | 4/10 | 0 → **135** → **3 978** | "got more and more distorted at about the 3:00 mark, out completely at 3:45." |
| R4-4 | branch | 10 | 4/10 | 0 → **54** → **1 132** | "got more and more distorted at about the 3:15 mark, out completely at 4:05." |
| R4-5 | `main` | — (baseline, every new pedal dark) | — | 0 → **26** → **205** | "Sounded fine until 3:50 when underruns started spiking, completely dropped out at 4:13 with 2k+ underruns" |

**What round 4 shows, on single runs.**
- **`main` runs away too.** Run as the last of five, `main`'s baseline collapsed at 3:50 and dropped out at 4:13 (2 000+).
  That overturns round 2's reading ("the runaway is the branch's, not the phone's"), which rested on one clean `main`
  run (B). The collapse follows the run's place in the sitting, not the build: runs 1 and 2 were fine, and runs 3, 4
  and 5 all collapsed between about 3:00 and 3:50, whichever build or stage count they carried.
- **On a fresh phone, four lit read like `main`.** R4-1 and R4-2 read 59 and 53 at 3:00, against `main`'s 48 when it
  ran first in round 3 (another sitting, so this is not a same-sitting gate). Round 3's run 2 (4/10, 259 and a
  runaway) ran fourth in its sitting, after a hot-phone runaway.
- **Stage count: no signal.** 10 stages read 59 and 54 at 3:00; 4 stages 53 and 135. Each pair holds one fine run and
  one collapse, decided by order. The desktop's −39 % for the Phaser (about a fifth of this world's lit cost) is lost
  in the run-to-run spread.
- **What carries over from run to run is not known.** Heat is the obvious candidate, but no run here separates it from
  Chrome's or the phone's state building up across page loads. Every collapse matches the one-way collapse seen on
  `bravo` (2026-09-21) and in rounds 1–3: once it starts, it does not recover.

**After round 4, on the still-hot phone (Crawford, same day).**
- **Restarting Chrome didn't help.** He let a collapse run until the music dropped out, closed every app, restarted
  Chrome and opened the same page: still no sound, underruns rising about 10 000 a minute. So the state that carries
  over is not the Chrome process's.
- **The plain sine was clean.** Straight after, a sine-only page (no app, no Tone: one 220 Hz sine on a plain
  `AudioContext`, the same `playbackStats` counter, a button adding 50 sawtooth oscillators at a time) played clean
  with 0 a minute. Adding load: 3 underruns at 250 oscillators, none at 300, a slow climb from 700 (settling near 24 a
  minute), more from 800, and the first audible distortion at 1 000.
- **So the phone's audio path still worked.** The app sits near the Pixel's limit even when the phone is cool (`main`
  logs underruns within 3 minutes on a fresh phone), so a throttled phone that still runs 700 plain oscillators can
  still be too slow for it.
- **Not run:** the same app link in an Incognito tab (empty storage), and the sine ramp on a cool phone (the
  capacity heat costs). Both were left for backlog 27's own branch, by Crawford's call.
- **Storage is an unlikely cause.** The app stores only named sessions (`trace-atlas.sessions.v1`), and only the
  Sessions panel reads them.
- **The day clock is ruled out.** It restarts at each page load (`dayStartTimestamp = Date.now() − …`), so it cannot
  carry over between runs.

## Robot Effect Sends (roadmap 50.7), desktop — T19, 2026-10-21

Branch `feature/robot-effect-sends` at `923174b0`. Spec §5's three desktop checks (docs/specs/ROBOT_EFFECT_SENDS.md;
plan docs/tasks/ROBOT_EFFECT_SENDS.md T19). The probes live in the session scratchpad and are not committed.

### 1. Crossings — the rooms pass; a connect sometimes loses a render quantum (`main` too)

**Probe.** Headless Chrome, a native real-time `AudioContext` under Tone (lookAhead 0.1), the real chain from
`buildGlobalFxChain`, a 220 Hz sine fed dry into the chain entry and through a 0.5 send gain into one room. The master
is recorded by an AudioWorklet that posts every 128-frame block with its `currentFrame`, on a same-origin page that does
not start the app. Each event makes the engine's own calls: a send ramp 0.5 → 0 with `setRoomFed(false)` and back; the
Shimmer and Double Returns 1 → 0 → 1; the Grit branch Mix 0.5 → 0 → 0.5 (the Colour room has no Return since the
2026-10-21 amendment). Controls: the same send ramp with the room kept fed. **Metric:** peak |second difference| in the
0.5 s after an event, over the larger steady peak (the 0.5 s before, or 1.0–1.45 s after once settled); near-zero runs;
missing blocks. **Self-check:** the room's Return gain jumped with no ramp reads ×10 to ×536.

Getting a metric that works took four tries. A sawtooth source hid every click (its reset is the biggest second
difference, so the unramped jump read ×1). Dividing by the window before the event alone read a dark-to-lit change of
timbre as a click. A ScriptProcessor recorder on the app's own page threw random ×50–×1 000 spikes on the controls.

**Three full runs:** every darkening, every control and every Grit event read ×0.84–×1.29, with no gap (the longest
near-zero run was 1 sample). Dark branches are disconnected once unfed, at Return 0 or at Mix 0. Lightings: 16 of 18
read ×0.84–×1.03. Two spiked: run 2's Double send up ×574 and run 3's Shimmer Return up ×448.

**Every spike** sits 0–2.7 ms after the lighting call, with one missing 128-frame block just after it. The audio thread
lost a render quantum at the connect. The same recorder caught it on two controls:

| Connect | Lightings that lost a quantum |
|---|---|
| Shimmer and Double room branches | 5 of 34 |
| the Tremolo's dry-chain bypass cell (roadmap 50.6, on `main`) | 1 of 4 (×97) |
| a FrequencyShifter outside the chain, into a muted `Gain(0)`, with no audible path | 1 of 4 (×54) |

No darkening lost one (0 of 42); disconnects run on the audio clock's timer.

**Reading:** the room crossings are smooth. The ×400–×600 spikes are an intermittent lost render quantum at a
connect, shared by 50.6's cells and by an unrelated effect connect, so not a T3/T4 wiring bug. Headless only so far:
whether it happens on a real output device or on the Pixel is not known. **Crawford's call (2026-10-22): record it
and carry on.** Backlog 29 holds the investigation; T20's listen adds a tick check on real speakers.

### 2. A dark room costs a dark effect — `npm run perf:audio`, 2026-10-22

**Builds,** served side by side: the branch at `e0216160` on 4173 and its base `2dc5b4a2` (main after the retune) on
4174, both `vite build` into the session scratchpad. **World:** one fresh world (−48, −5, `pelagos-default`) turned into
two share links on the branch. **Dark:** every robot's Grit, Shimmer and Double at 0, the three colour Mixes at 0, and the
Chorus and Shifter wets at 0. That makes the five effects dark on both builds: on the base they are chain pedals, on the
branch rooms with no feeder. **Seeded:** the world as seeded: four Grit robots (but no colour effect lit, so Grit is
silent), two Shimmer, one Double, Returns at 1. Both links load on both builds. The HUD read `fx in 2/10` dark on both,
and `fx in 4/10` seeded on both: on the branch the extra two are the lit Shimmer and Double branches, on the base the
Chorus and Shifter as fully wet chain pedals. That is why the seeded world is recorded on the branch only. 240 s, 15 s
buckets, warm-up 8 s, desktop, one run at a time, no stray Chrome.

| Run | Build | World | Mean | Peak window | Max |
|---|---|---|---|---|---|
| 1a | base | dark | 0.467 | 0.544 | 0.991 |
| 1b | branch | dark | 0.473 | 0.546 | 0.991 |
| 2a | branch | dark | 0.458 | 0.548 | 0.989 |
| 2b | base | dark | 0.466 | 0.578 | 0.989 |
| 3 | branch | seeded | 0.494 | 0.607 | 0.991 |

**Gate (spec §5 check 2: branch ≤ base, dark):** passed. The branch averages 0.466 mean / 0.547 peak window against the
base's 0.467 / 0.561, with the order reversed between rounds. **Seeded, recorded:** +0.028 mean and +0.060 peak window
over the branch's dark runs: the cost of two lit rooms, priced by 50.6.

An unplanned first pair, run by mistake with an empty query (so the default world as seeded, not either link): base
0.614 / 0.710, branch 0.697 / 0.784. Not like for like (the base's Chorus and Shifter run as chain pedals at their seeded
Mix), not a gate, and kept only so the slip is on record.

### 3. Main thread — power-on, a Decay flip, a send crossing 0, 2026-10-22

Dev servers of both builds (the base on 5198, the branch on 5199), the seeded link, headless Chrome over CDP; three page
loads per build (the branch nine, over three passes of the probe). "Powered" is when the FX chain exists; "unresponsive"
is the longest gap between answers to a 25 ms `Runtime.evaluate` poll after the click.

| | base | branch | gate |
|---|---|---|---|
| power-on (chain built) | 0.38–0.45 s | 0.38–0.49 s | about 2 s, no slower |
| longest unresponsive | 0.26–0.30 s | 0.27–0.44 s | — |
| Decay flip (`setCompressorBeforeDelay`) | 0.8–1.5 ms | 0.7–1.7 ms | ≤ 4 ms |
| a send crossing 0 (`updateRobotSends`, the branch connecting: Shimmer, Double, and Grit with Distortion lit at 0.3) | — | 0–0.1 ms | ≤ 2 ms |

Every branch crossing was checked to have connected its branch (`connected` true after the call). All three gates pass.
The branch's longest unresponsive gap reached 0.42 and 0.44 s in two of nine runs, against the base's 0.30 at most in
three; recorded, not gated.

## Robot Effect Sends (roadmap 50.7) on the Pixel — T21, Crawford's runs, 2026-10-22

Spec §5's phone gate (docs/specs/ROBOT_EFFECT_SENDS.md; plan docs/tasks/ROBOT_EFFECT_SENDS.md T21). **Builds:** T19's
two `vite build`s, served side by side on the LAN: the branch `feature/robot-effect-sends` on **4173** (product
code as `e0216160`; nothing under `src/` changed up to `59954360`) and its base `2dc5b4a2` (`main` after the retune) on
**4174**. Pixel 8, `?debug`, a fresh tab per run from a links page (`phone-gate.html`, session scratchpad), hands off to
3:00, watched to 4:00. **Rest:** the phone was switched off for at least 20 minutes before every run, a first for these
rounds. **Worlds:**
- **Seeded:** T19's world (−48, −5, `pelagos-default`) as the branch seeds it: Grit on three robots (silent, since no
  colour effect is lit), Shimmer on two, Double on one, Returns at 1. On the base the same link plays the Chorus and
  Shifter as fully wet chain pedals; both builds read `fx in 4/10`, so they carry the same number of lit effects.
- **Hand:** the same world with every robot's Grit, Shimmer and Double at 1, the three colour Mixes at 1 and the Chorus
  and Shifter Returns at 1. Branch only, recorded, not gated.

Before the round every link was loaded headlessly over the LAN address on its build: seeded `fx in 4/10` on both builds
at Full and Standard, hand `fx in 7/10` (two lit chain cells plus five room branches). The phone read the same.

| # | Build | Tier | World | `fx in` | `underruns` 3:00 → 4:00 | Crawford's words |
|---|---|---|---|---|---|---|
| 1 | base `2dc5b4a2` | Full | seeded | 4/10 | 0 → **48** → **100** | "everything sounded fine" |
| 2 | branch | Full | seeded | 4/10 | 0 → **76** → **508** | "at 3:30 it started spiking, but was perfectly fine til then. Around 4:20 it completely cut out w/ ~ 2K underruns." |
| 3 | branch | Standard | seeded | 4/10 | 0 → **62** → 106 at **6:00** | "everything sounded great, even 6 minutes in" (pulled away, so no 4:00 reading) |
| 4 | base `2dc5b4a2` | Standard | seeded | 4/10 | 0 → **68** → **95** | "sounded fine." |
| 5 | branch | Full | hand | 7/10 | 0 → **98** → **122** | "clipping wise it was great. super distorted, but loud distortion, not underrun clipping." |
| 6 | base `2dc5b4a2` | Full | seeded | 4/10 | 0 → **95** → **250** | "sounded ok, got some clipping around 4:20 but it was not the worst." |
| 7 | branch | Full | seeded | 4/10 | 0 → **59** → **97** | "sounded fine" |

Runs 6 and 7 repeat runs 1 and 2, added after run 2's result to give Full a spread, with the same 20 minutes off before
each.

**Reading against the gate** (the branch's count at 3:00 within the sitting's spread of the base's, no runaway; `fx in`
reads lit branches plus lit chain cells). **T21 passes.**
- **`fx in`: passes.** 4/10 is two chain cells plus the Shimmer and Double branches; 7/10 adds the three Grit branches.
- **The counts at 3:00: pass.** The base read 48, 68 and 95 (spread 48–95); the branch's seeded runs read 76, 62 and 59,
  all inside it. At Full alone: base 48 and 95, branch 76 and 59.
- **No runaway by 3:00 on any run.** Run 2 ran away after it: spiking at 3:30, out at about 4:20 with about 2 000
  underruns. Run 7, the same link on the same build, read 59 → 97 and sounded fine. The base had late trouble of its
  own: run 6 rose 95 → 250 with audible clipping at about 4:20. That is the 2:50–4:00 collapse of backlog 27, which
  spec §16 says does not fail the gate when `main` shares it.
- **The collapse does not follow the lit load.** Run 5, the same build and tier with 7 lit instead of 4, read 98 at 3:00
  and 122 at 4:00 with no collapse. So run 2's collapse is not the rooms' cost growing.

**New for backlog 27:** run 2 collapsed second in the sitting, after 20 minutes off. That is the first collapse on a
phone rested this way, so heat or state left over from an earlier run explains it less well than it explained round 4.

## Output Headroom (roadmap 54) on the Pixel — Checkpoint B (T10), Crawford's runs, 2026-10-23

Spec §5.4's phone gate ([docs/specs/OUTPUT_HEADROOM.md](../specs/OUTPUT_HEADROOM.md); plan
[docs/tasks/OUTPUT_HEADROOM.md](../tasks/OUTPUT_HEADROOM.md) T10). **Builds:** production `vite build`s served side by
side on the LAN, each on its own port so their browser storage stays apart: the branch `feature/output-headroom` at
`1c13470d` (`index-BPtv2uVr`; product code unchanged through `ad79498d`) on **4173**, `main` `abde941e`
(`index-Dhv9XsRM`) on **4174**, and for the bisection the branch without the ceiling (`index-CHKOo1LQ`, a local edit
that makes `getToneCtor('WaveShaper')` find nothing, not committed) on **4175**, which was not needed. Pixel 8,
`?debug`, a fresh tab per run from a links page (`phone.html`, session scratchpad), hands off to 3:00, read again at
4:00, the phone rested before each run (Crawford). **Worlds:** D5 (`bravo` at (−150, 90)) for the gate, as each build
seeds it: `main` on T3's link (Compressor release 0.126 s), the branch on T9's (0.275 s), the two links otherwise
identical (PERFORMANCE.md, "Output level series"); D1 (`56c2t2t8` at (−116, −2)), the world that crunched on `main`,
as an ear check, not gated. Every link was loaded headlessly over the LAN address first: right coordinates, powered
on, `fin ok`.

**Tier: Light, not the plan's Full.** The phone chose it: a coarse primary pointer defaults to Light
(`detectDefaultAudioLoad`, `src/utils/audioBudget.ts`, decision D), and the links did not pin `?load=`. So the round
measures what a phone plays out of the box.

| # | Build | Tier | World | `underruns` 3:00 → 4:00 | Crawford's words |
|---|---|---|---|---|---|
| 1 | `main` `abde941e` | Light | D5 | **93** → 106 | "acceptable pass." |
| 2 | branch `1c13470d` | Light | D5 | **149** → 173 | "barely acceptable pass" |
| a | `main` `abde941e` | Light | D1, ear check | **190** → 254 | "clicks happen throughout. Tiny bit of audio distortion as well. Not acceptable." |
| b | branch `1c13470d` | Light | D1, ear check | **140** → 173 | "clicks happen throughout." |

**Reading against the gate** (spec §5.4: the branch's count within the baseline's band, and the crunch gone).
**Checkpoint B passes on Crawford's decision** (2026-10-23: accept this round as it ran, rather than re-run at Full).
- **No cost the branch adds.** On D5 the branch read 56 more than `main` at 3:00; on D1 it read 50 fewer. A cost from
  the one node this phase adds (the ceiling, one table lookup per sample; T8 found none on the desktop) would show in
  both pairs. A gap that flips sign between worlds is the run-to-run spread, which on this phone has spanned 48–95 for
  one build in one rested sitting (T21 above). The plan's "within the baseline's band" cannot be read from one `main`
  run; the reversed D1 pair stands in for it.
- **The crunch is gone.** `main` on D1 carried "a tiny bit of audio distortion"; the branch, clicks only.
- **The clicks are underruns, on both builds**, and are backlog 27's, not this phase's.
- **Deviations from the plan:** Light rather than Full (above); one run per build; the bisection run not needed.

**New for backlog 27:** on a rested Pixel 8 at Light, the phone default, D1 clicks throughout on `main` (190 → 254)
and on the branch (140 → 173), and D5 reads 93–149 at 3:00. Crawford: chase it there.

## Backlog 27, desktop step 1 — D1 against D5 at Light, and what grows (2026-10-23)

plan.md Stage 1's first step ([backlog 27](backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included),
"Next, re-ordered"): the two worlds of the T10 round, on the desktop, with a read of what D1 carries. **Build:** a
production `vite build` of `perf/underruns-desktop` at `87b205c3` (`index-DekV9Q83`; `src/` is `main` `5bd7f593` plus
the overlay's new `events` token), `vite preview` on :4173. **Harness:** `npm run perf:audio` with the long-run columns
added the same day (PERFORMANCE.md "The long-run columns"): `--seconds 240 --bucket 15`, Light pinned by `?load=light`,
the world by the T10 `?session=` links (PERFORMANCE.md "The seven links"), headless Chrome, three rounds interleaved
(D1 D5, D5 D1, D1 D5), foreground, one run per call, orphaned Chrome 0 before and after. D1 = `56c2t2t8` (−116, −2),
D5 = `bravo` (−150, 90).

**What each world carries after the warm-up** (the overlay, as the harness now prints it). Both: `latency playback`,
`load 20%·fx 20%`, sounding cap 4, poly cap 8, `fx in 5/10`, `bank 4/4`, every LFO tier off, `events 12`. The one
difference the overlay shows: D1 `links 43/91`, D5 `links 25/91`.

| Round, world | mean cap | peak window | overall max | nodes first → last | heap MB first → last | events |
|---|---|---|---|---|---|---|
| 1, D1 | 0.523 | 0.659 | 0.998 | 1800 → 2125 (+324) | 35.7 → 42.1 | 12 → 12 |
| 1, D5 | 0.499 | 0.708 | 0.998 | 1815 → 1869 (+54) | 36.4 → 41.8 | 12 → 12 |
| 2, D5 | 0.478 | 0.537 | 0.994 | 1815 → 1870 (+55) | 35.4 → 41.6 | 12 → 12 |
| 2, D1 | 0.494 | 0.565 | 0.996 | 1798 → 2126 (+327) | 36.4 → 43.0 | 12 → 12 |
| 3, D1 | 0.492 | 0.554 | 0.953 | 1798 → 2122 (+324) | 33.6 → 42.2 | 12 → 12 |
| 3, D5 | 0.467 | 0.525 | 0.995 | 1815 → 1870 (+55) | 34.4 → 40.0 | 12 → 12 |

**Reading, against the backlog's question** ("Light on D1 read worse than Full on D5 did; what is it, and why does
Light not cut it?").
- **Steady load does not separate them.** D1 reads 0.02–0.03 above D5 on the mean, inside the round-to-round spread;
  both touch 0.95–0.998 in most 15 s buckets, so the desktop's audio thread also misses deadlines in bursts at Light,
  with four robots sounding. The callback interval was 20.0 ms in round 1 and 21.33 ms after (Chrome's choice per
  context, not a load signal). The pending Transport events stay at 12 throughout: nothing is scheduled and never
  cleared.
- **What grows is the live AudioNode count, and it is deterministic to the world.** D1 gains 324, 327 and 324 nodes in
  four minutes, bucket for bucket the same curve each round, climbing while robots undock and flat while they dock
  (buckets 9–12). D5 gains 54–55. The heap climbs about 6 MB in both, with garbage-collection drops along the way.
- **By type** (the harness's new breakdown, 90 s runs): D1 `Oscillator +198, Gain +31`; D5 `Oscillator +15,
  Gain +13`. Tone creates one native `OscillatorNode` and one `GainNode` per note start; the gains go, the oscillators
  stay.
- **Not a start-without-stop** (scratch probe `probe-osc-leak.mjs`, session scratchpad: `AudioScheduledSourceNode`'s
  `start`/`stop` patched before the app loads). D1 in 90 s: 224 oscillators started, 196 `stop()` called, 196 `ended`
  fired; the 28 never stopped are the fixed LFOs (`custom` and `sine`, the same 27–28 on D5). D5: 47 started, 20
  stopped. So **D1 plays about ten times the notes D5 does with the same four robots sounding**, and every note's
  oscillator ends as it should.
- **Retained, not awaiting collection** (scratch probe `probe-osc-gc.mjs`: `HeapProfiler.collectGarbage` twice after
  60 s of D1). Before the forced GC: `Oscillator +127, Gain +32` since the warm-up; after it: `Gain −12,
  Oscillator +9` (the nine are new notes). Not one ended oscillator was destroyed.
- **The holder, from the source** (Tone 15.1.22 and standardized-audio-context, `node_modules`):
  `Oscillator._start` builds a new `ToneOscillatorNode` for every start from the stopped state and connects the
  Oscillator's persistent `frequency` and `detune` Signals into the new node's params
  (`source/oscillator/Oscillator.js`, `_start`). When the note ends, `OneShotSource._onended` disposes the
  `ToneOscillatorNode`, which disconnects its own **output** and disposes its Param wrappers, but nothing ever calls
  `frequency.disconnect(deadNode.frequency)`: only the source side can remove an inbound connection. In
  standardized-audio-context every connect into an AudioParam inserts `[destinationParam, output]` into the **source's**
  output Set (`factories/audio-node-constructor.js`, `connectAudioParam`, with an `insertElementInSet` scan of that Set
  on every insert) and never forgets it until a disconnect. So each note leaves two strong references, one in the
  frequency Signal's Set and one in the detune Signal's, to an AudioParam whose `OscillatorNode` therefore cannot be
  collected; and each later connect from those Signals scans a Set that is longer by two. A retrigger while a note is
  still sounding reuses the node (`_restart` only cancels the pending stop), so dense legato leaks less than dense
  staccato. This is upstream behaviour the app meets by playing a Tone.Synth per layer (`compositeVoice.ts`), not a
  wiring bug of ours; whether Tone has it on file was not checked.

**What this does and does not say.** It names a leak that scales with notes played: about two retained oscillators a
second on D1 at Light, so some 500 by the phone's 4:00 mark and 7 000 an hour, each with a longer connect scan behind
it. It does not yet tie the leak to the underruns: the desktop's capacity bursts are there from the first bucket, before
anything has accumulated, and the audio thread does not render an ended source. The link, if there is one, would be
through the main thread (a growing scan per note start, GC pressure, the `detectCycles` walk that every connect runs;
backlog 29's lost render quantum sits on the same connect path) starving Tone's 100 ms look-ahead on a slow phone late
in a run, which is the shape of the 2:50–4:00 collapse. Two measurements would settle it, both desktop and both cheap:
the 15-minute long run as planned (does `nodes` keep its slope and does `lag (max)` or capacity drift with it), and an
A/B of a scratch build whose `Oscillator.onstop` disconnects the dead node's two params (one monkey-patch of Tone's
`Oscillator.prototype._start`, never committed) against stock, same world, same session. A fix proper is a dependency
patch or an upstream change to how notes are played, so it is Crawford's call and gets a spec (CLAUDE.md: ask before
changing the audio architecture).

**Housekeeping found on the way.** The harness's `--world name:x:y` had pinned nothing since 2026-09-28 (only
`?session=` does); the first smoke run landed on a random world under the `bravo` label. The harness now aborts when the
overlay's coordinates differ from the payload's. Its `sounding` column had read a dash since the two-dial budget line
of 2026-09-22; fixed. Both in `87b205c3`.

## Backlog 27, desktop step 2 — the 15-minute runs, and the leak A/B (2026-10-23, same sitting)

**The long runs** (Crawford's terminal, same build and links as step 1, `--seconds 900 --bucket 60`, the machine
otherwise idle; the two outputs were pasted into the session and are summarised here).

| World | mean cap first → last bucket | overall max | nodes first → last | by type | heap MB | events |
|---|---|---|---|---|---|---|
| D1 | 0.566 → 0.501, no trend (mean 0.470) | 0.996 | 1854 → 2911 (+1057) | Oscillator +1120, Gain +22 | 38.6 → 50.9 (+12.3) | 12 → 12 |
| D5 | 0.504 → 0.473, no trend (mean 0.433) | 0.996 | 1816 → 1987 (+171) | Oscillator +162, Gain +10 | 35.6 → 48.0 (+12.4) | 12 → 12 |

- **The leak holds its rate for fifteen minutes** (D1 about 70 nodes a minute, a straight line, never a drop) and
  **the desktop's audio thread never feels it**: capacity tracks the audible count, not the clock, and the 0.99 bursts
  are in the first bucket and no worse in the fifteenth.
- **The heap climbs the same 12 MB on both worlds**, though D5 leaks six times fewer oscillators. So most of the memory
  growth is a second accumulation, world-independent, about 0.8 MB a minute, not the oscillators. Unidentified; a heap
  snapshot diff (CDP `HeapProfiler.takeHeapSnapshot`, early against late) is the way to name it.
- Pending Transport events hold at 12 on both.

**The A/B** (Crawford's go-ahead given in the session). **Patched:** a throwaway `vite build` of the same tree with one
monkey-patch appended to `src/engine/audioContextSetup.ts` and reverted with `git checkout` after the build (the patch
text is kept in the session scratchpad as `osc-leak-patch.ts`; bundle `index-8SKi0TLk`, served on :4175): it wraps
`Tone.Oscillator.prototype._start` so the new `ToneOscillatorNode`'s `onended` first calls
`frequency.disconnect(node.frequency)` and `detune.disconnect(node.detune)`, then Tone's own handler. **Stock:** the step 1
build on :4173. D1 at Light, `--seconds 240 --bucket 15`, three rounds interleaved (stock patched, patched stock, stock
patched), foreground, one run per call, orphaned Chrome 0. The harness gained a `max lag` column for this (the largest
main-thread lag the overlay's sampler saw per bucket, `d14de9db`).

| Round | Build | mean cap | peak window | overall max | nodes | by type | heap MB | max lag range |
|---|---|---|---|---|---|---|---|---|
| 1 | stock | 0.526 | 0.643 | 0.996 | +326 | Oscillator +325, Gain +48 | +7.7 | 9–26 ms |
| 1 | patched | 0.543 | 0.650 | 0.996 | +48 | Gain +36, Oscillator +26 | +4.6 | 9–23 ms |
| 2 | patched | 0.541 | 0.617 | 0.995 | +48 | Gain +42, Oscillator +29 | +9.1 | — |
| 2 | stock | 0.579 | 0.621 | 0.996 | +322 | Oscillator +322, Gain +42 | +5.5 | — |
| 3 | stock | 0.551 | 0.648 | 0.995 | +324 | Oscillator +322, Gain +24 | +6.7 | — |
| 3 | patched | 0.558 | 0.636 | 0.996 | +47 | Gain +30, Oscillator +23 | +4.6 | — |

**Reading.**
- **The mechanism is proven.** Disconnecting the two params at `onended` takes the oscillator line from +324 to +48,
  and what remains is oscillators and gains in step (nodes awaiting ordinary collection, the balance D5 showed). So
  the holder was exactly the two inbound Signal connections, and nothing else.
- **It is not the desktop's underruns.** Stock 0.526 / 0.579 / 0.551 against patched 0.543 / 0.541 / 0.558: the
  difference is inside the round-to-round spread and has no sign. Peak windows and the 0.99 bursts are the same on
  both. Max lag sits at 9–26 ms on both, with no growth over four minutes.
- **The heap growth is not the oscillators either.** Patched climbs 4.6–9.1 MB in four minutes, stock 5.5–7.7; the
  second accumulation above is still there with the leak closed.

**Where that leaves backlog 27.** The desktop has now answered what it can. (1) At Light, the audio thread misses
deadlines in bursts from the first bucket on both worlds, with four robots sounding, so that is the graph's standing
cost at this tier, not an accumulation; whether the same bursts are the phone's steady clicks is for the sitting.
(2) The late collapse is not reproduced on the desktop in fifteen minutes on either world. (3) Two things do accumulate:
the oscillator leak (upstream, mechanism proven, cost unproven here; on a phone it still means a longer connect scan
per note and more memory) and an unnamed 0.8 MB/min heap growth that survives the patch. Either could matter on a
phone with no headroom and neither can be settled here. Crawford's calls: whether to carry the one-line disconnect as a
dependency patch or an upstream Tone PR (a spec either way, since it changes how notes are played); whether to name the
heap growth before the sitting; and whether the sitting takes the patched build beside stock.

## Backlog 27, desktop step 2b — naming the heap growth (2026-10-23, same sitting)

Crawford's decisions on the three calls above: the leak fix goes as a dependency patch (spec:
[docs/specs/OSCILLATOR_LEAK_FIX.md](../specs/OSCILLATOR_LEAK_FIX.md)); name the heap growth if it could improve
performance; the sitting after both.

**Method.** Against the dev server (unminified names; `npm run dev` on :5174), D1 at Light, Chrome's **sampling heap
profiler** started after the warm-up (`HeapProfiler.startSampling`, 8 KB interval, collected objects excluded) so only
allocations made during the run are sampled, read three times at 120 s intervals after a forced GC each (scratch probe
`probe-heap-growth.mjs`). A frame whose live bytes grow across the three readings is growth; one that stays flat is
steady-state churn. Then one direct read of Tone's context over two minutes (`probe-timeouts.mjs`, importing the
app's own Tone module instance by its pre-bundled URL).

**Heap after GC:** 40.0 MB at the start, 52.7 → 56.1 → 60.9 MB at 2, 4 and 6 minutes (the dev build carries React's
debug bookkeeping, so about three times the production slope).

**What grows, by allocating frame (120 s → 240 s → 360 s):**
- The whole growing set hangs off Tone's Transport tick (`_processTick` → `invoke` → our `scheduleRepeat` callback →
  `scheduleNote` → `triggerWithCap` → `compositeVoice.triggerAttackRelease` → Tone `Synth.triggerAttackRelease`), 4.8 →
  6.2 → 7.9 MB: per-note allocations that stay live.
- Inside it, **`Param.setValueAtTime` (Tone) 0.9 → 1.6 → 2.4 MB**: every note writes automation events into the frequency
  Param's and the envelope Signal's event Timelines. `Param` builds its Timeline with `memory 1000`
  (`core/context/Param.js`), and `Timeline.add` trims to the newest 1 000 events, so **each Param retains up to 1 000
  events, and the growth is bounded**: it stops once every sounding layer's params have written 1 000 events (a few
  hundred notes per layer for the envelope, 1 000 for the frequency), which on D1 is tens of minutes. About 100 bytes an
  event over some 36 layer synths with two to three automated params each puts the ceiling in the 7–11 MB range, which
  is the size of the 15-minute production climb (+12 MB on both worlds: D5's robots play fewer notes but every layer
  still writes events).
- **The leaked `OscillatorNode` wrappers** (standardized-audio-context's `createOscillator`), 0.46 MB over the run:
  the oscillator leak's JS-side footprint, gone with the patch.
- `scheduleVoiceRelease`'s `context.setTimeout` showed 2.1 MB of apparent growth; the direct read says otherwise: the
  context's timeout list holds 7–15 entries throughout (none past due, none NaN), while its ids advance about 24 a
  second (each note on a sounding layer re-schedules its stop). Misattributed by the sampler; not a leak.
- React's render output is the largest live set (11 MB) but flat across the readings: the latest render's tree, steady
  state. In production `jsxDEV` does not exist, and the dev build's React debug stacks explain the dev slope.
- Transport events hold at 8 one-shots and 4 repeats.

**Reading, against Crawford's condition ("if it could improve performance").** The world-independent heap growth is
Tone's per-Param automation history, capped at 1 000 events per Param: it saturates rather than runs away, and a
1 000-entry array per Param costs the main thread nothing measurable per note. Nothing here to fix for performance;
the one thing that did grow without bound was the oscillator leak, which the step 2 patch closes. **Prediction, not yet
observed:** a production run past about 30 minutes on D1 should show the heap flattening. **Closed as a cause**; the
prediction is the one loose end, and the long run that checks it can ride along with any later sitting.

## Backlog 29 — the lost render quantum is the recorder's clock, not the audio (2026-10-24)

[Backlog 29](backlog.md#29-audio-a-connect-sometimes-loses-a-render-quantum-main-included), "How to start": T19's
crossing probe in headed Chrome on a real output device. **Build:** the dev server of `main` at `4e0cb174` (after the
Oscillator Leak Fix merge, PR #577) on :5199. **Probe:** T19's `probe-crossing.mjs`, copied to this session's scratchpad
(`b29/`) and extended: headed by default (`HEADLESS=1` for T19's condition, interleaved in the same sitting), plus the
context's output path, the browser's underrun count, and the two checks below. Chrome 155.0.8059.84, the desktop's
speakers, one run per call, no stray Chrome before or after.

**It reproduces, headed and headless alike.** Both modes report the same output path (48 kHz, `baseLatency` 10.7 ms,
`outputLatency` 32–40 ms), so T19's headless runs were likely on the real device already. The metric's self-check
(`abrupt`, a Return gain jumped) read ×10–×617 in both, as T19's ×10–×536.

| | Lightings with the spike-and-hole | Darkenings |
|---|---|---|
| headed, the rooms (six runs) | 20 of 96 | 1 of 96 (a send's disconnect, 171 ms after the call) |
| headless, the rooms (three runs) | 8 of 48 | 1 of 48 |
| headed, the controls (Tremolo cell, a FrequencyShifter with no path) | 3 of 16 | 0 of 16 |
| headless, the controls | 1 of 16 | 0 of 16 |

The rate swings from 0 to 6 of 16 between runs. Holes away from the events all sat on the probe's own graph changes:
the recorder's connect 1.5 s before the first event, and the teardown.

**The mechanism, from Chromium's source** (`third_party/blink/renderer/modules/webaudio`, `main` at the time of
writing). `BaseAudioContext::UpdateWorkletGlobalScopeOnRenderingThread()`, called at the end of every render quantum,
sets the AudioWorklet scope's `currentFrame` **only if a `TryLock` on the graph mutex succeeds**. A main-thread connect
or disconnect holds that mutex. The render itself does not wait for it (`RealtimeAudioDestinationHandler::Render`
pulls the graph every quantum; `AudioContext::HandlePreRenderTasks` defers graph updates on a failed `TryLock`). So the
next `process()` reads the previous quantum's `currentFrame`. T19's recorder places every block at its reported frame,
so it wrote that block over the one before and left a 128-frame hole after it: the "missing block" and the ×50–×600
second-difference spike are the reconstruction's seam.

**Checked on the data, not just read in the source.** Two checks added to the probe: every step between consecutive
blocks' frames that is not 128, and the same metric with the blocks placed in **arrival order** (a MessagePort
delivers in order). Five runs (rooms and controls, headed and headless): every by-frame spike, 6 of 6, sits on a
frame step of **0** (a repeated `currentFrame`) followed by 256. In arrival order those lightings read ×0.89–×1.00, and no
event of any kind reads above ×1.22. The `abrupt` self-check still reads ×338–×636 in arrival order, so the
arrival-order metric would have caught a real click.

**Reading.** No render quantum is lost at a connect: the signal entering the destination is continuous, and the room
crossings, lightings included, are smooth. T19's "a connect sometimes loses a render quantum" was the recorder's
timestamp going stale for one block while the main thread held the graph lock. It is Chrome's behaviour on any graph
change, not Tone's or ours, so the planned bare-page split (native nodes only) answers nothing more, and there is
nothing for the Pixel to hear. Any later probe on this recorder should place blocks in arrival order, or treat a
repeated `currentFrame` as a seam, not a gap.

**Found on the way: `playbackStats` did not count a forced stall.** A self-check worklet busy-waited 200 ms inside one
`process()` (it reported back 200 ms each time, three times, headed); `AudioContext.playbackStats.underrunEvents` read
0 before and after, and so did every other snapshot of the sitting. Chromium collects those stats only while the page
`IsVisibleOrHasPermission()`, rate-limited, and absorbs them only on a successful graph `TryLock`; why a visible page
read 0 through a stall that must have starved the device is not known. The `?debug` overlay's underrun count reads
the same API, so on the desktop its 0 is not evidence of no underrun. Not chased.
