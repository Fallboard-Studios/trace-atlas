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
