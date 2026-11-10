# Phase Spec: The Desktop Crackles at Full — the Graph's Standing Cost at Every Tier

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - The desktop instrument: `npm run build && npx vite preview --port 4173` then
>   `npm run perf:audio -- --worlds "ez84fjmr:93:-146?theme=wreck&load=full,bravo:-150:90?load=full" --rot <n> --seconds 120 --bucket 15`
>   (W1 and W2, §1.1; hygiene: [PERFORMANCE.md](../PERFORMANCE.md) "Measurement hygiene")
> - The handler breakdown: `npm run perf:audio-handlers -- --world "ez84fjmr:93:-146?theme=wreck&load=full" --seconds 8`
> - The call-site census (Phase A, new): `npm run perf:audio-census -- --world "ez84fjmr:93:-146?theme=wreck&load=full"` (§1.2)
> - The ear: the production build served on the LAN or `vite preview`, Crawford's 4K desktop, the browser full screen,
>   his own Chrome open beside it, `?seed=ez84fjmr&x=93&y=-146&theme=wreck&debug`, hands off for five minutes (§1.6)

**Status:** spec written 2026-11-06 from the confirmed intent
[docs/intent/desktop-full-tier-standing-cost.md](../intent/desktop-full-tier-standing-cost.md) (interview 2026-11-06,
five questions, every guess confirmed) and the measurements on backlog
[67](../todo/archive/backlog-archive.md#67-audio-the-desktop-crackles-at-full--the-graphs-standing-cost-leaves-no-headroom) (the clean
Full/Standard/Light A/B of 2026-11-05). Approved for building 2026-11-06 (Crawford's word to implement the plan's
Phase A); Phase A done 2026-11-07. **Gate A (Crawford, 2026-11-07):** Q1 muted robots only (the docked and the
user-muted; solo-silenced robots keep their voices); Q2 G2b later, as roadmap
[69](../todo/roadmap.md#69-the-leaner-synth-layer-robot-voices-on-native-nodes); Q3 yes, Full boots at `playback`.
Phase B builds G1, G2a's bus filter, G4 and G3 in that order (T13's `out` Gain dropped), then a B9 ablation of the dark
effects' Signals, then the Gate B listen. Q4 is asked at Gate B, Q8 at Phase C.
Plan: [docs/tasks/DESKTOP_FULL_TIER_STANDING_COST.md](../tasks/DESKTOP_FULL_TIER_STANDING_COST.md) (written
2026-11-06). This is backlog 67's own fix, so it carries no new number (§7 Q7); plan.md Stage 1's line points here. Backlog 27's spec,
[LIGHT_TIER_STANDING_COST.md](LIGHT_TIER_STANDING_COST.md), is the method this one reuses; its decomposition record
(docs/todo/scratchy-audio-phones.md, "Backlog 27, the decomposition", §1–§13) is the price list this one starts from.

Survey basis (2026-11-06, against `main` at `6149d912`; every citation below was read, not recalled):

- **What the desktop measured.** Headless `perf:audio` on the live site, nothing but VS Code open, 120 s, three rotated
  rounds: Full **0.61**, Standard **0.56**, Light **0.29** mean capacity on `ez84fjmr` (93, −146, theme `wreck`); inside a
  Full run 0.50–0.59 with about 2.6 robots sounding, 0.62–0.73 with about 8.5 (backlog 67, the clean A/B). Live at
  full 4K with `&latency=playback`: `clock x0.62`, 2 063 underruns in 1:22, `lag 0ms`, `sounding 9/12`, `fx in 6/10`. The
  audio thread is overloaded for seconds at a time; the main thread is not the cause. Standard saved 0.05 because this
  world's robots never pass its cap of 8 and Standard keeps the pedals, Reverb, drift and filter LFOs.
- **What one robot's voice is** (`reserveVoice`, `src/engine/AudioEngine.ts:826–927`; `src/engine/audioEngine/compositeVoice.ts`):
  a composite `out` Gain (`compositeVoice.ts:186`, always unity: no caller passes `outputGain`), per audible layer one
  `Tone.Synth` (`:209`) and one layer Gain (`:214`), then a `Tone.Panner` (`AudioEngine.ts:848`), the bus Gain (`:849`),
  a `Tone.Filter` bus filter (`:852–856`) and five send Gains (`:851`, `buildSendGains`). Read in Tone 15.1.22's source
  (`node_modules/tone/build/esm`): a `Tone.Synth` is 4 Gains (Instrument volume, OmniOscillator volume, inner Oscillator
  volume, the AmplitudeEnvelope) and 5 Signals (the Omni's `frequency` and `detune`, `OmniOscillator.js:35,40`, which
  feed the inner Oscillator's own two, `Oscillator.js:30,36`, and the Envelope's `_sig`, `Envelope.js:44`); a
  `Tone.Filter` is 2 Gains, a Biquad and 4 Signals (`Q`, `frequency`, `detune`, `gain`, `Filter.js:33–48`), of which the
  app writes `frequency`, `Q` and the type (`updateRobotBusFilter`, `AudioEngine.ts:1129`), never `detune` or `gain`; **every Signal is a `ConstantSourceNode` started at construction and never stopped**
  (`Signal.js:38–47`). So a robot with three layers stands at about **24 Gains, 19 ConstantSources, a Panner and a
  Biquad: 45 nodes**; twelve robots about 540, whether they sound or not.
- **Every voice is built twice at boot.** `spawnRobot` reserves a voice for every robot, docked or not
  (`src/systems/spawnSystem.ts:723`), before the FX chain exists; `loadInstruments` reserves every robot again
  (`AudioEngine.ts:362–389`) and `storeVoice` disposes the first (`:200–208`). Disposed nodes leave the graph and cost
  the thread nothing; they do sit in the census until the GC collects them.
- **The sends are wired at 0.** Each of a robot's five send Gains is connected bus filter → send → room at reservation
  (`AudioEngine.ts:872–884`); `updateRobotSends` ramps levels and keeps the room feeder sets, it never disconnects
  (`:1185–1207`). A room's branches render only while the room is fed and lit (`setRoomFed`,
  `src/engine/audioEngine/bypassCell.ts:537–542`); the Reverb and Delay sends are always reachable.
- **The chain is built once and whole** (`buildGlobalFxChain`, `src/engine/audioEngine/globalFx.ts:177–415`): entry cut,
  EQ3 (a `MultibandSplit`, about 13 Gains, 19 Signals and 4 Biquads at neutral), LPF, HPF, the AutoWah, Phaser, Tremolo
  and Vibrato cells, Compressor, Width cell, Limiter, ceiling, master Gain; beside it the Reverb and Delay rooms and the
  Colour, Shimmer and Double rooms. A dark cell keeps its effect built: the crossing drops the effect's two edges and
  stops its LFOs (`bypassCell.ts:79–100, 327–339, 356–386`, backlog 27's H3a), and `in`/`dry`/`wet`/`cut` stay wired.
  Every Tone effect is pinned at `wet 1` and still carries Tone's own `Effect` plumbing (input, effectSend,
  effectReturn Gains and a `CrossFade`: a Panner, a WaveShaper, three Gains and a Signal; `effect/Effect.js:17–35`,
  `component/channel/CrossFade.js:41–76`), about ten nodes an effect, twelve effects, under cells that do the same job.
- **The bank** (`src/engine/lfoEngine.ts:231–263`): four lanes, each a `Tone.LFO` (about 5 Gains, 5 Signals, a WaveShaper
  idle, `LFO.js:54–80`), a trunk Gain, a drift `Tone.LFO` and two drift Gains; about 120 nodes. **A link is one Gain**
  (`lfoEngine.ts:346`, `lfoShared.ts:110–116`), trunk → link Gain → target param; at most 91 (7 global, 7 a robot). A
  held-off link drops its output edge and keeps the Gain (`suspendLink`, `:162–171`); nothing is torn down but a robot's
  links at stand-down or removal (`:361–378`).
- **What Full carries that Light does not** (`src/constants/index.ts:38–66`, `src/utils/audioBudget.ts:78–93`): twelve
  sounding robots and sixteen voices against four and eight; `interactive` latency against `playback`
  (`LOAD_PLAYBACK_BELOW` 0.61: Standard and Light take `playback`, Full keeps Tone's default,
  `src/engine/audioContextSetup.ts:22–47`); drift on (`LOAD_DRIFT_MIN` 0.8); the global filter links and every robot's
  `bus.frequency` link live (`LOAD_FILTER_LFOS_MIN` 0.4, `LOAD_BUS_FILTER_LFOS_MIN` 0.8); the pedals and colour lit
  (`LOAD_EFFECTS_MIN` 0.4) and the Reverb on (`LOAD_REVERB_MIN` 0.4).
- **Who stands down today.** Backlog 27's H2 releases a robot's voice only while it is *eligible and over the cap*
  (`setStandingByRobots`, `AudioEngine.ts:1459`; `src/engine/audioEngine/standingBy.ts`; `src/systems/audioBudgetSystem.ts:89–106`).
  A **docked robot is muted** (`audioMode: 'mute'`, [ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md) rule 6), so it is never
  eligible, never stands by, and **keeps its full voice on every tier**; so does a user-muted robot and every robot
  silenced by another's solo. At Full nobody is ever released. Backlog 27's A2 ablation, which released every robot
  outside the sounding set, read −0.124 / −0.107 capacity and −678 / −499 nodes at Light with about eight robots
  docked after the warm-up, and its record says in so many words that releasing docked robots "is a different cut,
  outside the spec's H2 and Gate A's pick; it is Crawford's to take or not" (scratchy-audio-phones.md §8).
- **The price list from Light** (same record, §3, §4, §6; desktop, same-session deltas, D1 `56c2t2t8` / D5 `bravo`):
  a standing-by robot's voice 0.013–0.016; a sounding robot about 0.057–0.063 by subtraction (A9: no robot voices at
  all, −0.389 / −0.354, leaving a floor of about 0.17 on both worlds); the five lit effects 0.093 / 0.083; the Reverb
  0.074 / 0.043; EQ3+LPF+HPF 0.041 / 0.019; the bank unstarted 0.038 / below noise; dark cells' LFOs 0.026 / below
  noise; the Compressor, Limiter and ceiling below noise; the send and room fabric itself about 0.01 / 0. The lit
  effects offline, ‰ of one core: Phaser (10 stages) 45.8, AutoWah 24.9, Chorus 16.7, Tremolo 16.1, Shifter 15.8,
  Width 11.8, BitCrusher 9.8, Vibrato 9.8, Chebyshev 5.9, Distortion 4.7; a Phaser costs about 3.1 ‰ a stage over a
  fixed 15.5 ‰; a biquad whose frequency is driven at audio rate costs about 2.6× its k-rate self (the k-rate probe,
  "What a lit effect costs", 2026-10-20), and k-rate is unreachable through Tone's wrapper (the native param sits in a
  module-private `WeakMap`), so it needs a native node.
- **The instruments.** `perf:audio` (CDP `WebAudio.getRealtimeData`, the census line by node class after the warm-up,
  `scripts/perf/audio-load.mjs`, pure parts in `audio-load-lib.mjs`), `perf:audio-handlers` (trace shares by handler
  class, read as shares never cost, 8 s window), and the hygiene rules (PERFORMANCE.md). **No census by call site exists
  in the repo**: the only one was a one-off Proxy over the node constructors on 2026-09-18 (scratchy-audio-phones.md
  "How to measure"), and the static tally above reaches about 600–650 of the 909–933 Gains the breakdown sees
  rendering every quantum; the rest is unattributed.
- **Immediate sound.** Every note goes through `scheduleNote` on the transport with `MIN_LEAD`; nothing in `src/`
  outside the engine calls `triggerAttack` or `triggerAttackRelease`, and nothing in a component plays a sound at
  `now()`. Output latency is not heard as timing anywhere in the app.

**Assumptions** (each a veto point; the plan's T0 confirms them with Crawford before T1):

1. **The arithmetic of Full's floor is the hypothesis Phase A tests.** Light's floor on D1/D5 was about 0.17 (base
   chain with the Reverb, five lit effects, the bank, the overhead). Full on W1 adds: the docked robots' standing voices
   (about nine docked at the trough × 0.015 ≈ 0.13), one more lit effect (≈ 0.02), the twelve `bus.frequency` links
   driving twelve biquads at audio rate and the four drift LFOs (≈ 0.03–0.05, unpriced), and `interactive` callbacks;
   plus the sounding robots (2.6 × 0.06 ≈ 0.16 at the trough, 8.5 × 0.06 ≈ 0.5 at the crest). That predicts about
   0.5 at the trough and about 0.7 at the crest, which is what the A/B read. **If it holds, the standing floor is
   mostly docked voices and Full's extras, and the crest is the music.** Phase A says whether it holds.
2. **Inaudible cuts apply to every tier, unconditionally** (backlog 27's tier rule §1.4, kept): no flag, no copy, no
   threshold. Full and Standard get them by construction; Light gets them too and is re-measured once, not re-tuned.
3. **An audible trade is a listen, not a threshold.** Where backlog 27 gated an audible cut below a slider threshold so
   Light took it and Full never did, this spec's audible candidates are *for Full*: each is built as its own listen
   build, Crawford hears it against the base on his desktop, and says yes or no to that one (intent). A yes makes it the
   sound at every tier (pre-v1: nothing is protected for an old sound's sake); a no drops it, its price recorded so it
   is not re-proposed. No "Full gets lighter" by a number.
4. **The music is not a lever.** Twelve sounding robots at Full, sixteen voices, every pedal a world lights, the Reverb,
   the bank's modulation: none is capped, held off or removed here (intent: the audio is the core feature). Fewer
   robots at Full is not proposed even on a miss; a miss returns to Crawford with the numbers (§1.6).
5. **The bar is Crawford's ear, then a pin.** Gate B is his listen at full 4K with his Chrome open (§1.6); the harness
   figure that Gate B's build reads on W1 is then recorded as the regression line (§5.4). The number guards the
   result; it does not define it, and no gate in this spec is "mean capacity under X".
6. **Reaching inside Tone** is allowed in the shape backlog 27 set: a wrapper in `src/engine/tonePatches.ts`, applied
   once at boot, feature-detected, a `devWarn`ed no-op on a Tone that moved, deletable at the Tone upgrade (backlog
   34). Building a node on the native context instead of a Tone wrapper is allowed inside `AudioEngine` and its
   modules (the ceiling and the output taps already are native). Forking Tone, `patch-package` or a new dependency is
   a question for Crawford first.
7. **The census by call site is tooling, not a product change**, and needs no source patch: a script injected over CDP
   before the page loads (`Page.addScriptToEvaluateOnNewDocument`) wraps the context's `create*` methods to record
   the node class and the first app frame of the stack, read back after the warm-up against a build with source maps.
8. **No docs guards, no source scans** (CLAUDE.md, 2026-10-23). The tests in §5 import what they check; a task with no
   behaviour has no RED test.
9. **Drawing at 4K is out of scope** (intent). If Gate B misses with the graph lean, the remainder is recorded as a new
   backlog item for the raster side with the measurements that point at it, and this work closes on its numbers.

---

## 1. Overview & Claude Explanation

Crawford's desktop clicks at Full on a heavy world at 4K from the moment robots start joining. Headless, the audio
thread stands at about 0.6 of its budget at Full on that world, 0.5 before the robots play and 0.7 when nine do, and
the headed browser drawing at 4K takes the rest. Backlog 27 fixed the same disease on the phone at Light by pricing
what Light carries and cutting what nobody hears; it left Full alone by design, and found on the way that **docked
robots keep their whole voice on every tier**, that every Tone parameter is a running source, and that a sounding
robot costs about four times a silent one. This spec does to Full what 27 did to Light, with 27's instruments and
27's gates, under one rule the intent fixed: **the audio stays**. Inaudible plumbing goes first and lands at every
tier; anything audible is heard by Crawford one trade at a time and taken or left on his word; the bar is his ear at
full 4K, and only then a number is pinned so the graph cannot creep back.

Three phases, each gated:

- **Phase A, the decomposition at Full** (no product change): W1 and W2 at Full, priced piece by piece with ablations,
  the handler breakdown and a census by call site, until the pieces account for the standing mean and the crest.
  **Gate A:** Crawford reads the table and picks the cuts.
- **Phase B, the cuts**: one task per cut, a RED test where there is behaviour, a same-session desktop A/B at Full on
  both worlds, kept or dropped on its number; the inaudible ones first. **Gate B:** Crawford's ear at full 4K on W1
  with his Chrome open. On a miss, the audible candidates are heard one at a time (§1.6).
- **Phase C, the pin**: Gate B's build measured on W1, the figure recorded in PERFORMANCE.md's table and this spec's
  §8, then docs.

### 1.1 The two worlds, and what Full carries

**W1** is Crawford's world, `ez84fjmr` at (93, −146), theme `wreck`: 9 of 12 sounding at the crest, 6 of 10 effects lit,
mean 0.61 at Full. **W2** is the control, `bravo` at (−150, 90) (backlog 27's D5; its Light-pinned `s=` blob is not
used, the bare seeded world is): up to 12 sounding, 0.67 at Full in the contaminated first reading. Both pinned by
`?load=full` so the record says so; the pin check (PERFORMANCE.md) aborts a run that lands elsewhere.

What the twelve robots and the chain stand at, by the survey (counts are built nodes, from the code; the census and
the call-site census confirm or correct them in Phase A):

| Piece | Built nodes, about | Renders when | Audible? |
|---|---|---|---|
| Twelve voices at three layers (Gains 288, ConstantSources 228, Panners 12, Biquads 12) | 540 | always, sounding or docked | the voice is the sound; its unity Gains and unwritten Signals are not |
| Sixty send Gains, five per robot, wired at 0 | 60 | always (reachable through the Reverb and Delay rooms) | no |
| The bank: four lanes, four drift LFOs, trunks and drift Gains | ≈ 120 | always | the lanes are heard through their links; the plumbing is not |
| Links, at most 91 Gains, each one Gain | ≤ 91 | while linked and not suspended | a link is modulation; its Gain is plumbing |
| EQ3, LPF, HPF (MultibandSplit + two Filters, with their Signals) | ≈ 50 | always | the curve is heard; the topology may be |
| Twelve effects, each in a cell or room, each with Tone's `Effect` plumbing (CrossFade, send/return) | ≈ 120 + the effects | the effect only while lit; the plumbing's own Gains while reachable | the effect yes; the plumbing no |
| Compressor, Limiter, ceiling, master Gain, the cuts, the room fabric | ≈ 40 | always | below noise at Light (A7, A8) |
| Reverb (one Convolver) and FeedbackDelay | few | always | yes |

### 1.2 Phase A — the decomposition at Full

Four instruments, all desktop, all on a production build, W1 and W2 at Full, in this order. The first and second are
backlog 27's; the third is new; the fourth is the one the floor's arithmetic (assumption 1) needs.

1. **The handler breakdown** (`perf:audio-handlers`, 8 s, three traces a world, interleaved): read as shares and
   instance counts, never cost; it says how many nodes render each quantum at Full and which classes, and prices the
   one Convolver and the biquads driven at audio rate against the rest.
2. **The census** (`perf:audio`'s census line after the warm-up, after a forced GC over CDP so disposed voices do not
   count): the live nodes by class at Full on both worlds, beside Light's 1 793 / 1 815.
3. **The census by call site** (new, `scripts/perf/audio-census.mjs`, pure tally in `audio-census-lib.mjs` with a
   `.test.mjs`; assumption 7): node class × the first frame outside `node_modules` of the constructor's stack, so the
   table says how many Gains `reserveVoice` makes, how many `buildGlobalFxChain`, how many `primeLfoBank`, and how many
   are Tone's own under each; read against a `vite build --sourcemap` throwaway served beside the stock build. Its
   deliverable is the attribution of the 909–933 rendering Gains and 329–336 ConstantSources the static tally leaves
   a third short.
4. **Ablation A/Bs in the app** (`perf:audio`, 120 s, 15 s buckets, three interleaved rounds against same-session
   stock, the noise band first from a byte-identical copy; each variant one `src/` edit on the stock commit built to
   the scratchpad, `src/` restored and `git status --porcelain src` empty after; nothing committed; each diff kept in
   the scratchpad). Read as the **difference in mean capacity from the same-round stock run**, with the **crest bucket**
   (the highest 15 s mean) recorded beside it, because W1 clicks at the crest. The pieces, one build each; they are
   §1.3's hypotheses made removable:
   - **B1** every muted robot's voice released (docked, user-muted, solo-silenced), the standing-by ledger widened: the
     docked voices' price, at the trough and at the crest.
   - **B2** every robot's voice refused (27's A9 shape): the floor at Full, and by subtraction the sounding robots'
     cost per robot at Full.
   - **B3** the twelve `bus.frequency` links suspended and the four drift LFOs stopped (Full's LFO extras at Light's
     setting): the price of what the two 0.8 thresholds let through.
   - **B4** every effect dark (27's A1 at Full): the six lit effects' price on W1, read against the offline list.
   - **B5** Tone's `Effect` plumbing bypassed on one lit cell and one dark cell (the cell's `in` connected to the
     effect's inner input and its inner output to `wet`, the CrossFade and send/return Gains left unreached): the
     plumbing's price per effect, times twelve.
   - **B6** the bus filter replaced by a native `BiquadFilterNode` on every robot (frequency written directly, the
     link Gain connected to the native `frequency` param): the Tone.Filter wrapper's price per robot (2 Gains, 4
     ConstantSources), and, as **B6k**, the same with `frequency.automationRate = 'k-rate'`: the a-rate price of the
     twelve bus biquads under their links.
   - **B7** the composite's unity `out` Gain removed and the layer Gain connected to the Panner directly: one Gain a
     robot, the smallest piece, priced so the table says what one standing Gain is worth.
   - **B8** Full at `playback` latency (`LOAD_PLAYBACK_BELOW` raised above 1 for the build): not a cost cut but a
     buffer; recorded as the crest's underrun count and the mean, since backlog 67's live reading says it did not
     rescue W1 alone.
   The ablations overlap and do not sum (27's rule: ordering, not addition); the table gives each piece's delta, the
   stock mean, the crest, and says how much of the stock mean the parts explain, overlap named.

**Phase A's deliverable** is one dated section in `docs/todo/scratchy-audio-phones.md` ("Backlog 67, the decomposition
at Full") holding the four tables, the noise bands and the builds' commit hashes, plus a **decision table** for Gate A:
each piece, its price on W1 and W2 (trough, crest, mean), the cut it implies (§1.3), whether that cut is audible, and
what it would take to build. **Phase A's criterion:** assumption 1's arithmetic is confirmed or corrected with numbers
(B1 + B2 + B3 + B4 against the stock mean on both worlds, each delta from three rounds with its spread), and the
call-site census attributes at least 90 % of the rendering Gains and ConstantSources to a maker. If a large piece is
left unnamed, Gate A decides whether to chase it or cut what is priced.

### 1.3 The hypotheses, and the cut each implies

Written before the numbers so Phase A tests them. None is a commitment; Gate A keeps or drops each on its price.
**G1–G4 are inaudible by construction; G5–G8 are audible and go to a listen only if Gate B misses (§1.6).**

| # | Hypothesis | Priced by | The cut, if the price warrants it | Audible? |
|---|---|---|---|---|
| **G1** | Docked robots (and any muted or solo-silenced robot) keep a 45-node voice for nothing; at the trough nine of W1's twelve are docked. This is most of Full's standing floor above Light's. | B1; the census (−45 a robot) | **Release every robot outside the sounding set**, not only the eligible ones over the cap: the standing-by ledger (`standingBy.ts`) takes muted and solo-silenced robots too, the stand-down waiting for the last note as now; `setSoundingRobots`' admission rebuilds a robot the instant it is eligible and admitted (`landOnActive`'s unmute reaches the budget's signature on the measure tick, `reReserveVoice` + `primeRobotLinks` before its first trigger, within `MIN_LEAD`, the path H2 built and measured: crossing ×1.000, first note on time). Takes with it the sends-ramp wart H2 recorded (a fresh voice's sends `rampTo` from `now()` inside a Transport callback → `setValueAtTime` at the tick's time). Solo is the awkward case: one solo silences eleven, and un-solo readmits eleven in one tick, eleven connects into the live graph at once; §7 Q1 decides whether solo-silenced robots are released at all. | **No**: a released robot is one that triggers nothing anyway |
| **G2** | A voice carries Tone wrapper plumbing the app never writes: the composite's unity `out` Gain, each `Tone.Synth`'s three volume Gains at unity, the Omni's two Signals that only feed the inner Oscillator's two, the bus filter's `detune` and `gain` Signals (the app writes `frequency` and `Q` and sets the type). About 20 of a robot's 45 nodes. | B6, B7; the call-site census; the per-node price from B7 | **A leaner voice.** In two steps. **G2a**, inside the app's own code: the bus filter built as a native `BiquadFilterNode` (frequency set and swelled through its native param, the `bus.frequency` link Gain connected to it), the composite `out` Gain dropped, −7 nodes a robot. **G2b**, the synth layer: a layer built on native nodes (an `OscillatorNode` per note as Tone already starts one, a native Gain envelope with the same ADSR curves, frequency and detune written per note) instead of `Tone.Synth`, −7 nodes a layer, −21 a robot, and the standing ConstantSources of twelve robots from 228 to about 0. G2b is a voice rewrite (portamento, articulation, pulse width, the layer gain and detune link targets, the swell writes on ADSR) and is **built in this phase only if B2's per-robot price at Full and Gate A say the sounding robots are the load at the crest** (assumption 1 predicts they are); else it is recorded as a roadmap phase of its own (§7 Q2). | **No** if the envelope and oscillator are the same shape; G2b's listen is the proof (§5.3) |
| **G3** | Twelve effects carry Tone's `Effect` plumbing (CrossFade, send and return Gains, about ten nodes each) under bypass cells that already do the dry/wet job; the plumbing renders while reachable. | B5; the call-site census | **Bypass the wrapper**: a cell connects to the effect's inner input and output, so the CrossFade and send/return never render; or, where Tone's public surface does not reach the inner nodes, a `tonePatches.ts` wrapper (assumption 6). Nothing the user hears changes: the cell's `dry`/`wet` law is the one in force already. | **No** |
| **G4** | Full at `interactive` renders 480-frame callbacks where Standard and Light render 960; the shallower buffer absorbs less of a drawing spike. Decision J moved Standard to `playback` on the Pixel's 6.6× fewer underruns; backlog 67's live reading says `playback` alone did not rescue W1. | B8 (the crest's underruns, the mean) | **`LOAD_PLAYBACK_BELOW` above 1**, so every tier takes `playback`: one constant. Output latency is heard nowhere as timing (survey); the only thing it changes is how late the sound follows a slider, by about 10 ms more. Proposed as margin, not a fix; §7 Q3. | **No** (not as sound; as control feel, Crawford judges) |
| **G5** | Twelve bus biquads driven at audio rate by their `bus.frequency` links recompute coefficients every sample (27's H4); at Full all twelve links are live. | B6 against B6k | **k-rate on the bus filter's frequency**, reachable once G2a makes it native: about −60 % of the biquad's own cost. A slow LFO stepping the cutoff every 2.7 ms is probably inaudible; the AutoWah's follower and the Phaser are the fast cases and are not this cut. | **Maybe**: a listen |
| **G6** | The lit pedals are Full's largest audible piece (six lit on W1; a Phaser alone 45.8 ‰, 3.1 ‰ a stage over a fixed 15.5 ‰). | B4; the offline prices | **Cheaper versions, one at a time**: the Phaser's seeded stage ceiling lowered (the Classic band is 4–12, `src/data/bands/classic.ts:105`; 12 → 8 is about −13 % at the old ceiling), the AutoWah's rolloff −12 or −24 dB (private `_bandpass`; a `tonePatches.ts` wrapper), the Phaser and AutoWah rebuilt on native biquads at k-rate (−37 % / −35 % by the probe's estimate; a build of its own). Each is heard against the base on Crawford's desktop and taken or left. | **Yes**, each its own listen |
| **G7** | EQ3 is a `MultibandSplit` (four Linkwitz-Riley filters, 19 Signals) where three biquads would do; with LPF and HPF it priced 0.041 / 0.019 at Light. The worlds are not at neutral (the levels are seeded), so backlog 28's "keep at neutral" is not the question; the topology is. | the call-site census; an ablation only if Gate A asks | **A three-band EQ on three native filters** with the same stored levels: a different curve shape at the band edges, so a listen. Low priority; proposed only if the census reads it large at Full. | **Yes**, a listen |
| **G8** | The Reverb's Convolver follows the seeded decay (0.5–4 s); W1's price is unknown (D1 0.074, D5 0.043 at Light). | the breakdown's Convolver share; B-ablation only on Gate A's ask | **None proposed.** The Reverb is music (intent); a shorter seeded decay ceiling is an audible retune Crawford may ask for after hearing the price, not a cut this spec makes. | **Yes**; recorded, not built |

**Not cuts, recorded for the census's sake:** the double voice build at boot and on restart (disposed nodes cost the
thread nothing; the census reads them until the GC runs, so Phase A forces a GC before the census line; a cleanup is
proposed to Gate A as hygiene, not as a cost cut); the orphan ConstantSource under every `Tone.Multiply` (started,
never connected, so never rendered; census noise); the two `?debug` analysers (a harness artifact).

### 1.4 The rule

- **Inaudible → everywhere, unconditional.** A change nobody can hear is not a change to the sound. No gate, no store
  flag, no copy, no threshold. Its proof is the desktop A/B at Full on W1 and W2, one Light run to show Light did not
  move the wrong way, and, where the cut has a crossing (a robot released and rebuilt; a cell re-wired), the
  inaudible-crossing bar (the real-time-context recorder recipe, DARK_EFFECT_BYPASS.md §5 step 2: ≤ ×1.6, no gap).
- **Audible → a listen, one trade at a time** (assumption 3). Built as its own listen build on top of the inaudible
  cuts, A/B'd on the desktop for its number, then heard by Crawford on his desktop against the base: the same world,
  a few minutes each way, his words recorded. **Yes** lands it at every tier; **no** drops it with its price in the
  table. No audible cut is gated to a tier in this spec; Standard is not a separate decision.
- **Dim what a cut makes inert.** G1 makes nothing inert (a muted robot's controls already read as muted). If a yes
  on G6 removes a control's effect (a Phaser stage count the band no longer reaches), that control is dimmed with its
  value kept (Crawford, 2026-10-29).
- **Inside Tone only as a wrapper or beside it as a native node** (assumption 6); no fork, no `patch-package`, no new
  dependency without asking.

### 1.5 Phase B — the cut protocol

Cuts go in **Gate A's order**, the inaudible ones first and alone (G1, G2a, G3, then G4 if Crawford takes it, then
G2b if Gate A kept it), each kept or dropped on its own A/B. One task each, in this shape:

1. **RED test first** where the cut has behaviour (a release and rebuild rule, a wiring change, a native node in place
   of a wrapper, a constant's threshold); none where it has only a number.
2. **Build** the cut on the build branch, one commit.
3. **The desktop A/B:** the branch against its own base (the previous cut in), same session, three interleaved
   rounds, W1 and W2 at Full, 120 s, plus one Light run per world per arm. **Kept** when the mean capacity drops by
   at least the piece's Phase A price less the noise band on W1, the crest bucket does not rise, `max lag` is inside
   the base's spread, and the Light runs read inside the band. **Dropped** otherwise, the commit reverted, the number
   recorded. A piece Phase A read below noise is kept when it reads inside the band, not worse, and its census falls.
4. **A crossing, where the cut has one:** the recorder recipe, three runs, ≤ ×1.6, no gap. For G1: a docked robot's
   stand-down, an undocked robot's admission and first note, and (if solo-silenced robots are released) an un-solo
   readmitting eleven in one tick.
5. **Recorded** in `scratchy-audio-phones.md` under the decomposition section, the decision table updated.

Each cut's keep or drop is Crawford's call on the number. Phase B ends when the inaudible cuts are in, and goes to
Gate B.

### 1.6 Gate B — Crawford's ear at full 4K, and what happens on a miss

**The protocol.** The branch's production build and `main`'s, served on the LAN or by `vite preview` on two ports.
Crawford's 4K desktop on its usual power plan, the browser full screen on the 4K monitor, his own Chrome open beside
it as on the day he heard the clicks, W1 with `&debug`, hands off for **five minutes** from power-on (through a whole
wave: robots docking and joining, the crest included), the overlay's `clock`, `underruns` and `sounding` read at 1:00,
3:00 and 5:00 and his words recorded verbatim; then `main` the same way, as the baseline. Once more at a quarter-size
window if the full-screen run is not clean, so the record says how far the raster side is from the audio side.

**Pass:** W1 clean by ear for the five minutes at full screen with his Chrome open: no clicks, no distortion, no
dropout. The count is recorded, expected far under the 2 063 of 2026-11-05, and not gated. Also one Standard and one
Light listen on W1, a minute or two each, nothing changed by ear.

**On a miss, the audible candidates are heard one at a time**, in Gate A's order among G5, G6 and (if Gate A kept it)
G7, each its own Phase B-shaped task (RED test where there is behaviour, build, desktop A/B for its number) and then
its own listen (§1.4): Crawford hears the trade on his desktop and says yes or no to that one. After each yes the
Gate B protocol runs again; the first clean build wins and nothing past it is kept. If every candidate is heard and W1
still clicks at full screen, this work closes on its numbers: the graph's floor and the crest at Full are known, the
quarter-window run says how much the raster side costs, and that remainder goes to the backlog as the raster item the
intent names (assumption 9). Fewer sounding robots at Full is never on this list (assumption 4).

### 1.7 What does not change

The music: notes, melodies, harmony, swells, the lifecycle and the wall-clock day. Twelve sounding robots and sixteen
voices at Full. The tiers' thresholds and the Audio Load dial's three presets, except `LOAD_PLAYBACK_BELOW` if Crawford
takes G4. The bypass cells' law and crossing (`writeCellMix`). The `Robot`, `GlobalAudioSettings`, session and share
shapes: nothing new is stored, shared or saved. The gem: nothing on the body reads any of it. What a muted robot's card
and controls say (G1 changes no UI). The pedals, the Reverb and the bank's modulation as the user set them, unless a
listen says yes to a specific trade.

---

## 2. Target File Structure

Phase A touches no product file but the tooling. Phase B's files depend on Gate A; the list below is every file a
hypothesis's cut would touch, so the plan can name them per task.

```text
scripts/perf/
├── audio-census.mjs                 # Phase A: the census by call site over CDP (new; the plumbing, verified by runs)
├── audio-census-lib.mjs             # Phase A: the pure tally — class × first app frame, sorted, formatted (new, unit-tested)
├── audio-census-lib.test.mjs
└── audio-load.mjs                   # Phase A: a forced GC (HeapProfiler.collectGarbage) before the census line
package.json                         # perf:audio-census

src/engine/audioEngine/standingBy.ts # G1: the ledger takes every robot outside the sounding set, not only the eligible ones
src/systems/audioBudgetSystem.ts     # G1: pushes muted (and, per Q1, solo-silenced) robots as standing down; the sends' setValueAtTime at the tick
src/systems/audioBudgetSystem.test.ts, src/engine/AudioEngine.test.ts
src/engine/AudioEngine.ts            # G1: the reserve/refuse/admit rule; G2a: native bus filter, no composite out Gain; G2b: the leaner layer
src/engine/audioEngine/busFilter.ts  # G2a: a native BiquadFilterNode behind the same helpers; G5: automationRate 'k-rate'
src/engine/audioEngine/compositeVoice.ts, voiceEntry.ts   # G2a/G2b: the voice's shape; what a VoiceEntry holds
src/engine/audioEngine/*.test.ts
src/engine/lfoShared.ts, lfoEngine.ts   # G2a/G2b: a link Gain connected to a native AudioParam target
src/engine/audioEngine/bypassCell.ts, globalFx.ts   # G3: a cell wired to the effect's inner nodes; G6: the Phaser/AutoWah variants
src/engine/tonePatches.ts            # G3/G6 only if an inner node is not on Tone's public surface (the leak-fix shape)
src/constants/index.ts               # G4: LOAD_PLAYBACK_BELOW
src/data/bands/classic.ts, aspects.ts    # G6: the Phaser's seeded stage ceiling in the band table, if Crawford says yes
src/utils/audioBudget.test.ts, src/engine/audioContextSetup.test.ts   # G4

docs/todo/scratchy-audio-phones.md   # "Backlog 67, the decomposition at Full": Phase A, each cut's A/B, Gate B, the listens
docs/PERFORMANCE.md                  # perf:audio-census; the forced GC; the running table's W1 Full pin (§5.4)
docs/AUDIO_SYSTEM.md                 # Signal Graph: the voice's shape after G2; "Audio Load Budget": who stands down (G1); G4 if taken
docs/ROBOT_LIFECYCLE.md              # rule 6: a docked robot's voice is released and rebuilt on undock (G1)
docs/todo/backlog.md, docs/todo/plan.md   # 67's Built line; Stage 1's line; a raster item or a G2b phase if either is spun off
```

---

## 3. Implementation Boundaries & Constraints

- **Phase A changes no product behaviour.** The census script is tooling (TDD'd pure part, plumbing verified by runs,
  the backlog 30/31 precedent); the ablation builds are throwaway, `src/` restored and the tree clean after each,
  nothing committed, each named in the record by the stock commit it was cut from and what it removed.
- **Every removal is proposed, never made unasked.** Gate A picks the cuts; each cut is kept or dropped by Crawford on
  its number; each audible trade is his yes or no after a listen. A cut outside G1–G8 that the census suggests joins
  the decision table as a proposal.
- **The music is not a lever** (assumption 4): no cap, hold-off or removal of sounding robots, voices, pedals, the
  Reverb or the bank at Full.
- **CLAUDE.md's audio rules hold.** Every node and every AudioParam write lives in `AudioEngine`, `globalFx.ts`,
  `bypassCell.ts`, `busFilter.ts`, `compositeVoice.ts` or `lfoEngine.ts`; nothing is scheduled from a GSAP callback or
  a timer; `MIN_LEAD` applies to a rebuilt robot's first trigger; a native node is created from Tone's own context
  (`Tone.getContext().rawContext` or the wrapper's `createBiquadFilter`), never a second `AudioContext`. State stays
  JSON-serialisable; the engine's ledgers are module state.
- **The architecture is not changed without asking.** A leaner voice (G2b) is a change to how `AudioEngine` builds a
  voice, not to who owns it or how notes are scheduled; it still goes to Crawford at Gate A before a line is written,
  and spins off as its own phase if he says so (§7 Q2).
- **Inside Tone only as a wrapper** (`tonePatches.ts` shape) or beside it as a native node; a fork, `patch-package` or a
  new dependency needs asking.
- **Measurement hygiene** (PERFORMANCE.md): production builds, same-session interleaved A/B, foreground, one call at a
  time, orphaned-Chrome check before and after, the code named by commit; Gate B's listen with his Chrome open on
  purpose, because that is the condition that clicked.
- **No file-text tests**: a task with no behaviour (a constant's value, a record, docs) has no RED test; its proof is a
  run or a read, named in the commit.
- **Protected:** `.env*`, `node_modules/` (no rewrite under it), public build assets.
- **User-facing text**: none is expected; if a yes on G6 dims a control, its note lives in `src/content/`.

---

## 4. Code Style & Architecture Conventions

G1 as it would read, the ledger's rule widened and nothing else new (only if Gate A keeps it):

```typescript
// src/systems/audioBudgetSystem.ts — today the eligible robots outside the sounding set stand by (H2).
// G1: every robot outside the set stands down — eligible-over-cap as before, and muted (per Q1, solo-silenced) too.
const sounding = new Set(reconcileSounding(/* … as today … */));
const standingDown = robots.filter((r) => !sounding.has(r.id)).map((r) => r.id);
AudioEngine.setStandingByRobots(standingDown); // the ledger releases after the last note, refuses reserveVoice meanwhile
const rebuilt = AudioEngine.setSoundingRobots([...sounding]); // admits: rebuilds any released robot now in the set
for (const id of rebuilt) primeRobotLinks(id); // before its first trigger; MIN_LEAD covers the note

// src/engine/audioEngine/busFilter.ts — G2a: the same helpers, a native node behind them
export function buildBusFilter(ctx: BaseAudioContext, cutoffHz: number): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoffHz, ctx.currentTime);
  return filter; // the bus.frequency link Gain connects to filter.frequency; G5 sets filter.frequency.automationRate = 'k-rate'
}
```

- Names as the neighbours': the ledger keeps `standingBy`/`setStandingByRobots` (the docs say what "standing by" now
  covers); native-node builders live in the module that owns the node and are headless-safe (a missing context or
  method falls back to the Tone wrapper with one `devWarn`, the `getToneCtor` pattern).
- A release and rebuild goes through `releaseVoice` / `reReserveVoice` / `primeRobotLinks`, the paths H2 uses; no new
  voice-management surface.
- A wiring change inside a cell lives in `bypassCell.ts` beside `connectEffect` / `disconnectEffect`, so the crossing
  and the wiring cannot drift apart.
- Scripts: ESM `.mjs`, the pure part in a `-lib.mjs` with a `.test.mjs`, CDP plumbing in the runner, `--help` text,
  documented in PERFORMANCE.md (the `perf:audio-handlers` pattern).

---

## 5. Testing & Verification Requirements

### 5.1 Phase A — the decomposition (runs, not tests; tooling TDD'd)

- **`audio-census-lib.mjs` (RED first):** given recorded `(nodeClass, stack)` pairs, picks the first frame outside
  `node_modules` (or the top Tone frame when none), tallies class × frame, sorts by count, formats the table with totals
  and the share attributed; an empty record gives an empty table, not NaN; a frame with no source map keeps the raw
  location.
- **The forced GC** before `perf:audio`'s census line: pinned by a run that shows the census stable across two reads.
- **The runs:** the breakdown, three a world; the census once a world; the call-site census once a world; the eight
  ablations B1–B8, three interleaved rounds each against same-session stock, W1 and W2 at Full, 120 s, the noise band
  first. **Criterion** (§1.2): assumption 1 confirmed or corrected with numbers; ≥ 90 % of the rendering Gains and
  ConstantSources attributed; every number with its spread; every build named by commit.
- **Gate A:** the decision table read by Crawford; the cuts picked and ordered.

### 5.2 Phase B — per cut (RED first, one task each)

- **G1:** every robot outside the sounding set is released once its last note has rung out, and `reserveVoice` refuses
  it meanwhile; a docked robot that undocks is rebuilt on the tick that admits it and its links primed before any
  trigger; a user unmute with a free slot is admitted and rebuilt within a measure, with the set full it stands by as
  today; a muted robot keeps "disabled" on its card; `setSoundingRobots(null)` rebuilds everyone; `stopAudioBudget`
  rebuilds everyone; a fresh voice's sends take their value with `setValueAtTime` at the tick's time (no Tone
  "scheduled inside a callback" warning); solo per Q1; mute, solo and `triggerWithCap` paths otherwise unchanged;
  the voice counter never strands (`scheduleVoiceRelease` is waited for, as H2 does).
- **G2a:** a reservation builds a native bus filter (or the Tone wrapper when the context has no `createBiquadFilter`,
  with a `devWarn`) and no composite `out` Gain; `updateRobotBusFilter`/the swell writes land on the native param;
  the `bus.frequency` link Gain is connected to it and `disposeRobotLinks` disconnects it; the headless mocks pin the
  per-reservation wrapper count that `AudioEngine.test.ts:4724–4754` pins today, updated to the new shape.
- **G2b** (only if Gate A keeps it): a layer's note starts one oscillator and one envelope with the stored ADSR,
  portamento and articulation; frequency, detune and pulse width per note; the layer gain and detune remain link
  targets; the swell writes on ADSR land; the composite's `set({ layers })` live patch holds; the mocked
  node count per layer falls as designed.
- **G3:** a lit cell's `in` reaches the effect's inner input and the inner output reaches `wet`, nothing reaches the
  CrossFade or the send/return Gains; the crossing (`connectEffect` / `disconnectEffect`) still drops and remakes the
  same two edges; the Phaser's Stages rebuild (`rebuildPhaser`) goes through the same wiring; a wrapper in
  `tonePatches.ts`, if one is needed, is feature-detected and a `devWarn`ed no-op on a Tone that moved.
- **G4** (only if Crawford takes it): `latencyForLoad(1)` (`src/utils/audioBudget.ts:98`) is `'playback'`; `resolveBootLatencyHint`
  (`audioContextSetup.ts:35`) with no `?latency=` installs `playback` at Full; an explicit `?latency=interactive` still wins; `audioBudget.test.ts` and
  `audioContextSetup.test.ts` updated as decision J's were.
- **G5, G6, G7** (only on a Gate B miss, each after its own listen): the k-rate flag set and read back; the Phaser's
  stage ceiling in the band and the dimmed control if the stage slider's top is unreachable; the AutoWah's rolloff
  through its wrapper; a native Phaser/AutoWah built behind the same cell with the same fields.
- **Every cut:** `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean; the mutation gate on the pure
  parts (the TDD workflow); the desktop A/B of §1.5 step 3 recorded; the crossing recipe of step 4 where there is one.

### 5.3 Gate B — Crawford's ear (§1.6)

W1 at full 4K with his Chrome open, five minutes, branch then `main`; one Standard and one Light minute. Clean by ear
is the pass. For G2b, if built, the listen is also the proof that the voice is the same shape: a few robots on W1 and
W2 at Full, branch against base, "nothing changed" in his words. Every listen's words and overlay readings go in the
record.

### 5.4 Phase C — the pin

Gate B's passing build, `perf:audio` on W1 at Full, 120 s, three rounds in one sitting beside a byte-identical copy
(the noise band): the **mean capacity and the crest bucket** are recorded in PERFORMANCE.md's running table and this
spec's §8 with the commit hash. The pin is the figure measured, not a target. **A regression** is a later change that
reads above the pin by more than that sitting's noise band on a same-session A/B against the pinned commit; it is
explained in its PR, not forbidden.

### 5.5 Checks

Every task: types, lint, tests, build clean. Docs tasks: a read.

---

## 6. Git & Workflow Context

- **Docs** (the intent, this spec, then the plan) on `docs/intent-desktop-full-tier-67`, off `main` `6149d912`; its PR
  is Crawford's. **Build** on `perf/desktop-full-tier-standing-cost`, off `main` once the docs merge (else off the docs
  branch).
- **Order:** Phase A tooling (the census script with its lib and tests; the forced GC), then the runs (one task per
  instrument, each a recorded section), then the decision table → **Gate A**; Phase B one task per inaudible cut in
  Gate A's order, each with its A/B and crossing → **Gate B** (on a miss, the audible listens one at a time, Gate B
  again after each yes); Phase C the pin; then docs (AUDIO_SYSTEM.md, ROBOT_LIFECYCLE.md, PERFORMANCE.md, backlog 67's
  Built line, plan.md's Stage 1 line) and the archive move at merge.
- One commit per task, short imperative messages naming the proof ("the A/B", "a run", "a read", "the listen").
  Throwaway ablation builds are never committed. The PR is Crawford's.
- Follows CLAUDE.md's workflow skills: TDD per task, incremental, stop at each gate.

---

## 7. Open Questions

1. **G1's reach: muted only, or every robot outside the set?** Docked and user-muted robots are the frequent case and
   leave one at a time; solo-silenced robots leave eleven at once and come back eleven at once on un-solo, eleven
   connects into the live graph in one tick (about one connect in six loses a quantum headless, backlog 29/T19;
   inaudible on speakers one at a time, unmeasured as a burst). **Recommendation:** release muted robots only in this
   phase; solo-silenced robots keep their voices; the burst is measured by the crossing recipe and solo joins G1 in a
   later task if it reads clean. Crawford decides at Gate A.
2. **G2b, the leaner synth layer: here or its own phase?** It is the one inaudible cut that reaches the crest (the
   sounding robots), and a voice rewrite. **Recommendation:** priced here (B2, B6, B7, the census); built here only if
   Gate A reads the sounding robots as the crest's load and Crawford says so; else a roadmap phase of its own (the
   next free number), with this spec's numbers as its brief.
3. **G4, Full at `playback`.** Inaudible as sound; about 10 ms more between a slider and its effect. Decision J took
   the same step for Standard on the Pixel's numbers. **Recommendation:** take it as margin at Gate A if B8's crest
   underruns fall, since it costs one constant and nothing else; leave `?latency=interactive` as the way back.
4. **The listen's length and condition.** Five minutes through a whole wave, full screen on the 4K, his Chrome open as
   on the day, is the proposal; Crawford may shorten it or add a window size. The quarter-window run is for the record.
5. **W2.** `bravo` at (−150, 90) is the control because 67's first reading used it and 27 priced it; a second heavy
   theme world (a `wreck` or `perilous` seed with 12 sounding) would say whether W1 is typical. **Recommendation:** W2
   as named; a third world only if Gate A wants it.
6. **The call-site census's build.** A `vite build --sourcemap` throwaway served beside stock gives readable frames; the
   dev server would too but at a different cost profile. **Recommendation:** the sourcemapped production build, so the
   census is read on the graph the ablations measure.
7. **Numbering.** Backlog 67's own fix: no new number; 67 gets the Built line and archives at merge; plan.md Stage 1's
   line points here. A spun-off G2b phase or a raster item takes the next free number (69 at writing).
8. **The pin's home.** PERFORMANCE.md's running table (the Audio Load Budget's baseline rows) plus §8 here, as
   backlog 27 did; or a new "Full tier pins" section. **Recommendation:** the running table, one row, and §8.

## 8. As built

Shipped in PR #607 (2026-11-07). Measured, heard and pinned on 2026-11-10. The record is
[todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md), "Backlog 67, the decomposition at Full", §1–§10.

**The cuts kept** (Crawford, 2026-11-10). Each figure is the same-round mean delta at Full, W1 / W2, against the build
before it, with a noise band of 0.021:

| Cut | Commit | Mean | Where it differs from §1.3 |
|---|---|---|---|
| **G1**: muted and docked robots stand down | 135d09f9 | −0.074 / −0.064 (trough −0.14) | Muted robots only: solo-silenced robots keep their voices (§7 Q1). The sends-ramp wart stays (T10 dropped): an admitted robot's sends keep their 50 ms fade from `now()`, and Tone's once-per-page warning on an admission is expected. |
| **G2a**: a native bus filter | a0bc52db | −0.031 / −0.018 (crest −0.055 / −0.032) | The bus filter only. The composite `out` Gain stays, since B7 priced it below noise (T13 dropped at Gate A). |
| **G4**: Full at `playback` | f1ffd3d1 | priced in Phase A (B8) | As proposed. The Audio Load readout no longer names the hint (T17b). |
| **G3**: the cells skip Tone's `Effect` wrapper | 7901cfd5 | −0.020 / −0.018 | A cell connects to the effect's `effectSend` / `effectReturn` (Tone's protected fields), or to a StereoEffect's `_split` / `_merge`. Both are feature-detected (`effectEnds` in `bypassCell.ts`); an effect with neither keeps the edges into and out of the effect itself, warned once. There is no `tonePatches.ts` wrapper. `wireCells` changed with it (amended at Gate A). |

Every crossing is inaudible (≤ ×1.02 against the ×1.6 bar), and admitted robots' first notes are on time. Light did not
move the wrong way: G1 made it 0.055 cheaper, and G2a and G3 left it inside the band. Taken together, W1's mean at Full
went from about 0.58 to about 0.44, and its crest from 0.64 to 0.53 (§9 of the record, across pairs).

**Not built here.** G2b, the leaner synth layer, was spun off at Gate A as roadmap 69. G5–G8 were not needed, since
Gate B passed. B9, the dark effects' standing Signals, was priced at −0.026 / −0.022 and spun off as backlog 72.

**Gate B: passed by ear on 2026-11-10** (record §10). The listen was on W1 at Full, full screen on the 4K. With the cuts
in, the overlay counted 2 underruns, both at power-on, over six minutes. On a2a400c1, the commit before the cuts, it
counted 16, spread through five minutes. Neither build was heard to click.

The protocol differed from §1.6 in four ways, all recorded in §10:
- The baseline was the pre-cut commit, not `main`, because PR #607 had already merged the cuts.
- The run with the cuts was on the dev server, not a production build.
- The overlay was read only at the end of each run.
- The Standard and Light minute was skipped, at Crawford's call.

**The pin** (§5.4; [PERFORMANCE.md](../PERFORMANCE.md), "The audio pin at Full"). This is 5ca8679f's code on W1 at
Full, three rounds beside a byte copy:

| Mean | Crest | Trough | Band (mean / crest / trough) |
|---|---|---|---|
| **0.473** | **0.547** | 0.370 | 0.015 / 0.018 / 0.040 |

A later change that reads above the pin by more than its own sitting's band, on a same-session A/B against 5ca8679f's
code, is a regression to explain in its PR. The absolute figure moves between sittings: the same graph read about 0.03
lower the night before.
