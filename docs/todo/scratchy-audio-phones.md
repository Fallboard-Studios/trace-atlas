# Scratchy / Cutting-Out Audio on Phones — Investigation State

Opened 2026-09-18 on branch `bugs/scratchy-audio-phones` (cut from `main` after PR #484 merged roadmap 17.2.1/17.2.2). **Nothing is changed or committed for this issue yet** — this file is the handoff. Related: [17.2.4](roadmap.md#1724-performance-audio-scheduling-headroom-tone-lookahead) (Tone `lookAhead`), [17.2.5](roadmap.md#1725-performance-idle-paint--composite-cost), [PERFORMANCE.md](../PERFORMANCE.md).

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

## How to measure (the scratch scripts are gone; recreate from this)

All drive headless Chrome over CDP (Node 24 built-in `WebSocket`, no dependency), load `vite preview` of a production build, click `button[aria-label="Power on"]`, wait ~8 s. `?seed=<word>&x=<int>&y=<int>` pins the otherwise-random world. **`?seed=` alone does not** — it fixes the Attenuation Style (global FX chain) but the locale coordinates, and so the robots, BPM and day phase, stay random per load. Pin both for any A/B.

1. **Render-thread time per quantum** — `Tracing.start` with `includedCategories: ['webaudio','audio']`; sum `dur` of `RealtimeAudioDestinationHandler::Render` events (thread `AudioOutputDevice`). Budget = 128/48000 s = 2.67 ms. This is light. Adding `disabled-by-default-webaudio.audionode` gives per-handler timings (`GainHandler::Process`, `OscillatorHandler::Process`, `ConvolverHandler::Process`, …) but **the tracing itself inflates load ~3×** — use it only for the relative breakdown.
2. **DevTools "Web Audio" panel data** — `WebAudio.enable`, capture `WebAudio.contextCreated` (the `realtime` one), then **poll** `WebAudio.getRealtimeData({contextId})` every ~500 ms (`contextRealtimeDataChanged` events do not arrive on their own). Fields: `renderCapacity` (0–1), `callbackIntervalMean`, `callbackIntervalVariance` (seconds).
3. **Node counts by creator** — inject via `Page.addScriptToEvaluateOnNewDocument` a Proxy over each `AudioNode` subclass constructor plus a wrapper over every `BaseAudioContext.prototype.create*`, recording `new Error().stack` (set `Error.stackTraceLimit = 40`); aggregate by the first non-plumbing frames on an **unminified** build (`npx vite build --minify false --outDir <tmp>`).
4. `AudioContext.renderCapacity` (the JS API) is **not available** in Chrome 153 desktop, even with `--enable-experimental-web-platform-features`.

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
- `playoutStats` / `renderCapacity` JS APIs are absent in Chrome 153 desktop, so the overlay cannot count glitches directly; whether the Pixel's Chrome has them is unknown.

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
