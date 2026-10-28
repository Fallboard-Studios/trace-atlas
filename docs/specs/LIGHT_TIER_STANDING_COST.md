# Phase Spec: The Light Tier's Standing Cost — What Light Still Carries on the Phone

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - The desktop instrument: `npm run build && npx vite preview --port 4173` then
>   `npm run perf:audio -- --worlds "56c2t2t8:-116:-2?load=light&s=<D1>,bravo:-150:90?load=light&s=<D5>" --rot <n> --seconds 240 --bucket 15`
>   (D1 and D5's links: [PERFORMANCE.md](../PERFORMANCE.md), "The seven links"; hygiene: PERFORMANCE.md "Measurement hygiene")
> - The handler breakdown (Phase A, new): `npm run perf:audio-handlers -- --world "<D1 spec>" --seconds 60` (§1.2)
> - The phone: two production builds on the LAN, `?debug&load=light` plus the world link, Pixel 8 rested, a fresh tab per
>   run, hands off to 3:00, read again at 4:00 (the sitting protocol, [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md)
>   "Backlog 27 on the Pixel — the sitting")

**Status:** spec written 2026-10-27 from the confirmed intent
[docs/intent/light-tier-standing-cost.md](../intent/light-tier-standing-cost.md) (interview 2026-10-27) and the
measurements on backlog [27](../todo/backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included)
(desktop steps 1, 2 and 2b of 2026-10-23; the Pixel sitting of 2026-10-26, both in
[scratchy-audio-phones.md](../todo/scratchy-audio-phones.md)). **Approved by Crawford 2026-10-27**, with the plan's two
deviations (ablation runs at 120 s; H2's mid-note release path decided in T14). Plan:
[docs/tasks/LIGHT_TIER_STANDING_COST.md](../tasks/LIGHT_TIER_STANDING_COST.md). This is backlog 27's own fix, so it
carries no new number (§7 Q6); plan.md Stage 1's line points here. **Gate A, 2026-10-28:** Crawford picked the
cuts (the intent's "Gate A — the cuts"): the inaudible ones first and alone, the audible ones only on a phone miss,
tried stacked in one sitting; §1.3, §1.5, §1.6 and §5 follow it.

---

## 1. Overview & Claude Explanation

The phone's default Audio Load tier, Light, clicks on the phone. Two rested sittings on `main` (2026-10-23 and
2026-10-26, Pixel 8, D1 and D5, Light pinned, `playback`) read "scratchy throughout" from the first seconds, about two
hundred underruns by 3:00, no collapse, and no audible difference from the oscillator leak fix. The desktop agrees on the
shape: at Light, with four robots sounding, D1 and D5 alike hold the audio thread near half a core (means 0.49–0.52) and
burst to 0.95–0.998 in most 15-second buckets, from the first bucket. So the clicks are the graph's **standing cost** —
what is rendered every quantum whether or not a note is playing — and the tier's own cuts (four sounding robots, eight
voices, `playback`, filter and drift LFOs held off) leave about 1 790 live nodes and five of the ten bypass effects lit
on the phone. Every fix reasoned rather than measured (lazy voice chains in September, the Dark-Effect Bypass, the leak
fix) came to a few points or nothing audible. This spec does not name a fix. It names **a decomposition** of the standing
cost at Light, **a rule** for which cuts may follow and where they apply, **the protocol** each cut passes through, and
**the one criterion** that decides the whole thing: Crawford's ear on the Pixel, the same four links, clean.

Three phases, each gated:

- **Phase A, the decomposition** (no product change): the desktop at Light, D1 and D5, priced piece by piece until the
  pieces account for the standing mean; plus the facts the sittings did not record (which five effects D1 and D5 light).
  **Gate A:** Crawford reads the table and picks the cuts (2026-10-28: the inaudible ones first, §1.5).
- **Phase B, the cuts**: one task per cut, each a RED test where there is behaviour, a same-session desktop A/B, and
  kept or dropped on its number. A cut nobody can hear applies to every tier; an audible one is gated below a threshold
  on the Audio Load sliders, so Light takes it and Full never does. Gate A put only the inaudible cuts here; the
  audible ones wait for a phone miss (§1.6). **Gate B:** Crawford's desktop listen at Full and at Light (nothing
  changed: Phase B holds only inaudible cuts).
- **Phase C, the phone**: the sitting protocol, read the other way. **Gate C:** clean by ear on D1 and D5 at Light for
  four minutes on a rested phone. On a miss, three audible Light-only cuts are built and tried stacked in one sitting
  (§1.6).

### 1.1 What Light carries today (the facts the decomposition prices)

The overlay after the warm-up on both worlds: `load 20%·fx 20%`, `latency playback`, sounding cap 4, poly cap 8,
`fx in 5/10`, `bank 4/4`, every LFO tier off, `events 12`; D1 `links 43/91`, D5 `links 25/91`; about 1 800 live nodes
at the end of the warm-up (step 1's table). What the two sliders cut at Light, and what they leave, by the code
(`src/utils/audioBudget.ts`, `src/systems/audioBudgetSystem.ts`, `src/constants/index.ts`):

| Robot Load 0.2 | Effects Load 0.2 | Not gated by either |
|---|---|---|
| `maxAudibleRobots` 4 (of 12), FCFS; the other eight **stand by** with their full voice chains built | `driftEnabled` false (`LOAD_DRIFT_MIN` 0.8): the four lanes' rate- and depth-drift Gains detached, the drift secondaries still running | the ten bypass effects' Mix: a lit pedal or colour branch runs at Light exactly as at Full (no `LOAD_PEDAL_MIN` / `LOAD_COLOUR_MIN` was ever built; DARK_EFFECT_BYPASS.md §1.5 dropped the Mix floor because a dark pedal then cost the same as a lit one — true before the cells, not after) |
| `maxPolyphony` 8 (of 16) | `filterLfosEnabled` false (`LOAD_FILTER_LFOS_MIN` 0.4): `lpf.*` / `hpf.*` link Gains suspended | the Reverb and Delay rooms, always on; the three effect rooms, live while fed |
| `latencyHint` `playback` (`LOAD_PLAYBACK_BELOW` 0.61) | `busFilterLfosEnabled` false: every robot's `bus.frequency` link suspended | the four lane LFOs and their four drift secondaries, always running (`primeLfoBank`); the EQ links stay linked (nearly free) |
| | | twelve robots × (3 `Tone.Synth` + Filter + Panner + bus Gain + 5 send Gains), every Tone `Signal`/`Param` behind them a running `ConstantSource` |
| | | the dark pedals' own LFOs (Chorus 2, Tremolo 2, Vibrato 1, Phaser 2, the AutoWah's follower): most of the 38 ‰ all ten dark still cost on the desktop |
| | | the base chain: entry cut, EQ3 (MultibandSplit), LPF, HPF, filter cut, five chain cells' cuts, Compressor, Width cell, Limiter, ceiling, masterGain; the Reverb convolver (decay seeded 0.5–4 s); the FeedbackDelay; three rooms' `in`/`cut`/`return` |

The only census of the whole graph is from 2026-09-18 (about 1 400 nodes: 411 Gains, 12 oscillators, 10 biquads, a
Convolver, a DynamicsCompressor, about 260 always-running `ConstantSource`s, "almost all from `spawnRobot`"; reverb
ablation 2–7 points; 12 quiet robots 24 % against 3 at 16–20 %). It predates roadmap 50.1–50.7, the rooms, the cells and
the ceiling. The post-50.x numbers are per effect only (lit: Phaser 45.8 ‰, AutoWah 24.9, Chorus 16.7, Tremolo 16.1,
Shifter 15.8, Width 11.8, BitCrusher 9.8, Vibrato 9.8, Chebyshev 5.9, Distortion 4.7; all ten dark in cells 38.3 ‰).

### 1.2 Phase A — the decomposition

Three instruments, all desktop, all on the production build at Light, D1 and D5, in this order; the first says what
*kind* of work the thread does, the second says which *piece of the app* each kind belongs to, the third is the static
count that turns a per-node price into a total.

1. **The handler breakdown (new script).** Chrome's trace category `disabled-by-default-webaudio.audionode` times every
   handler's `Process` on the audio thread (`GainHandler::Process`, `BiquadFilterHandler::Process`,
   `OscillatorHandler::Process`, `ConvolverHandler::Process`, `DynamicsCompressorHandler::Process`,
   `AudioParamHandler::…`, the worklet, …); the plain `webaudio` category gives `RealtimeAudioDestinationHandler::Render`
   per quantum. Verified usable on 2026-09-18 (scratchy-audio-phones.md "How to measure", step 1) with one caveat that
   fixes the method: **tracing inflates the load about 3×, so the breakdown is read as shares, never as absolute
   cost.** A new script, `scripts/perf/audio-handlers.mjs` with its pure tally in `audio-handlers-lib.mjs` (unit-tested,
   the backlog 30/31 precedent), drives the same CDP plumbing as `perf:audio` (`cdp-lib.mjs`): load the pinned world,
   power on, warm up, trace 60 s, and print **self time per handler class as a share of `Render`**, plus the count of
   handlers of each class seen, so a class's share divides into a per-node price. Three runs per world; the shares'
   spread is the noise band.
2. **Ablation A/Bs in the app**, `npm run perf:audio`, each a throwaway production build with one piece removed
   (`src/` restored after, never committed; the PERFORMANCE.md "Patch recipe" shape), against stock served beside it,
   same session, three interleaved rounds, D1 and D5, 240 s, 15 s buckets, foreground, one call at a time, orphaned
   Chrome 0. Read as the **difference in mean capacity from the same-round stock run** (the LFO-cost method of
   2026-09-20), with the peak window and `max lag` recorded beside. The pieces, one build each — they are hypotheses
   H1–H5 of §1.3 made removable:
   - **A1** every bypass effect forced dark at power-on (`fx in 0/10`): the lit effects' price at Light.
   - **A2** the eight standing-by robots' voices released after admission settles (their chains out of the graph):
     the standing chains' price.
   - **A3** the dark pedals' LFOs stopped (`stop()` on each dark cell's effect LFOs after build): their price.
   - **A4** the four lanes and their drift secondaries stopped: the bank's standing price with every tier off.
   - **A5** the Reverb removed; **A6** EQ3, LPF and HPF removed (both at neutral since backlog 28); **A7** the
     Compressor, Limiter and ceiling removed. The base chain, piece by piece.
   - **A8** the five send Gains per robot removed and the rooms unbuilt: the send/room fabric's price.
   The ablations are not additive to the whole (the September rule: "parts do not sum exactly; treat as ordering"), so
   the table reports each piece's delta, the stock mean, and the sum, and says how much of the stock mean the sum
   explains.
3. **The census.** `perf:audio`'s by-type tally already counts every `WebAudio.audioNodeCreated`; one addition prints
   the **full live-nodes-by-type line at the end of the warm-up** (not only the first→last deltas), so the record says
   how many Gains, ConstantSources, biquads, oscillators, delays and convolvers Light carries. Multiplied by the
   breakdown's per-node prices this is the standing cost of the nodes nothing can ablate (the `ConstantSource` behind
   every Signal and Param).

**Also in Phase A, two facts:** (a) which of the ten effects D1 and D5 light, and which rooms are fed, read from the
running app over CDP after the warm-up (the store's `globalAudio` Mixes and the robots' sends; recorded beside the
overlay's `fx in 5/10`); (b) the lit effects' price at Light on the phone is *not* measured in Phase A — the phone is
Phase C's instrument only.

**Phase A's deliverable** is one dated section in `scratchy-audio-phones.md` ("Backlog 27, the decomposition") holding
the three tables, the two facts, the noise bands and the builds' commit hashes, plus a **decision table** for Gate A:
each piece, its price on D1 and D5 (desktop share and ablation delta), the cut it implies (§1.3), whether that cut is
audible, and its tier. **Phase A's criterion:** the ablation deltas together explain **at least 70 %** of the stock mean
at Light on both worlds, each delta from three rounds with its spread stated; a piece whose delta is inside the noise
band is reported as "below noise", not as zero. If the sum explains less than 70 %, the remainder is reported as
unexplained and Gate A decides whether to chase it (a further ablation) or cut what is already priced.

### 1.3 The hypotheses, and the cut each implies

Written down now, before the numbers, so Phase A tests them rather than discovers them. None is a commitment; Gate A
keeps or drops each on its price.

| # | Hypothesis | Priced by | The cut, if the price warrants it | Audible? → tier |
|---|---|---|---|---|
| **H1** | Lit pedals and colour effects run at Light because nothing gates them; D1 and D5 both carry five lit, and the Phaser alone costs what four lean pedals cost. | A1; breakdown's biquad and oscillator shares; fact (a) | **An effects tier.** One more flag on the Effects Load axis, `effectsEnabled: load >= LOAD_EFFECTS_MIN`, placed like `LOAD_FILTER_LFOS_MIN` (0.4: Light below, Standard and Full above; §7 Q2). Below it `applyLfoTiers`'s successor drives **every chain cell and room branch dark through `writeCellMix`'s own crossing** with the stored Mix untouched, and restores them the same way above it; a store boolean `effectsHeldOff` greys the ten Mix rows with a `HeldOffNote` and `describeLimits` says "no pedals or colour"; the overlay's `lfo` line gains `fx off`. The rooms' Returns stay; a held-off branch is dark, so a room costs what a dark effect costs. | Audible (the pedals go silent) → **Light only** |
| **H2** | Eight standing-by robots' full voice chains cost the thread for nothing: 3 synths, a filter, a panner and 7 gains each, every Signal a running `ConstantSource`. | A2; census × per-node price | **Release standing-by voices.** `audioBudgetSystem` already knows the sounding set; a robot leaving it gets `releaseVoice` (its links disposed by the existing path), a robot entering it gets `reReserveVoice` + `primeRobotLinks` before its first trigger, within `MIN_LEAD`. A `null` sounding set (Full) releases nothing, so Full is unchanged by construction. Risk: the admission build is a connect into the live graph (backlog 29: no lost quantum; T19: about one connect in six loses one quantum headless, inaudible on speakers). September priced the idle chains low on a smaller graph; Phase A re-prices them. | Inaudible at Full (no standing-by robots); at Light a robot's first note after admission must not be late or clicked → **every tier, by construction** |
| **H3** | Oscillators that run for nothing: (a) the dark pedals' own LFOs, (b) the drift secondaries while drift is held off, (c) the `ConstantSource` behind every Signal and Param. | A3, A4, the census | (a) **Stop a dark cell's LFOs at the darken crossing and start them at the light crossing** (`Tone.LFO.stop()`/`start()`; a restarted LFO begins at phase 0, which on a dark pedal nobody hears). (b) **Stop the drift secondaries while `driftEnabled` is false**, not only detach their Gains. (c) has no cut inside Tone — a `Signal` is a running `ConstantSource` by design; it is priced so the census's number is known, and the only lever against it is H2 (fewer chains). | (a), (b) inaudible → **every tier**; (c) none |
| **H4** | Biquads driven at audio rate recompute coefficients per sample: at Light the LPF/HPF and bus links are suspended, so this bites only through a lit Phaser or AutoWah. | the breakdown's `BiquadFilterHandler` share, with and without A1 | **None of its own in this spec.** H1's hold-off removes it at Light. k-rate is unreachable through Tone's wrapper (the native param sits in a module-private WeakMap in Tone's bundled deps), so the every-tier version is a Phaser and AutoWah built on native nodes — a build of its own, recorded for Gate A and not carried here unless the decomposition says the lit pedals dominate even after H1. | — |
| **H5** | The base chain (EQ3, LPF, HPF, two compressors, ceiling, Reverb, Delay, rooms, cuts) is small, as September found. | A5–A8; the breakdown's convolver and compressor shares | **Only if a piece reads large:** a Reverb decay cap at Light (audible → Light only), or reopening backlog 28's decision to keep EQ3/LPF/HPF in at neutral (Crawford's, archived; reopened only on a number). The Compressor and Limiter are musical and stay. | per piece |

**Gate A's verdicts (2026-10-28,** the intent's "Gate A — the cuts"; the record's decomposition §7): H2, H3a and H3b
kept for Phase B (inaudible, every tier); H1 and H5's Reverb decay cap kept for a phone miss only, with the sounding
cap (§1.6); H5's EQ3/LPF/HPF removal at neutral dropped (the EQ levels are seeded, so the worlds are not at neutral;
backlog 28's decision stands), as are the Compressor, Limiter and ceiling and the send/room fabric (below noise); H3c
and H4 have no cut of their own.

### 1.4 The tier rule

- **Inaudible → everywhere, unconditional.** A change nobody can hear is not a change to the sound (pre-v1: no
  "keep existing sound" constraint). It needs no gate, no store flag, no copy. Its proof is a desktop A/B and, for
  anything with a crossing, the inaudible-crossing bar (≤ ×1.6, no gap).
- **Audible → a threshold on the Audio Load sliders.** One constant in `src/constants/index.ts` beside the existing
  three (`LOAD_DRIFT_MIN`, `LOAD_FILTER_LFOS_MIN`, `LOAD_BUS_FILTER_LFOS_MIN`), one boolean on `EffectsLoadLimits` or
  `RobotLoadLimits`, pushed by `audioBudgetSystem` with a store boolean the UI greys against, named in `describeLimits`
  and on the overlay. Light (0.2) is always below it; Full (1) is always above it; **Standard (0.6) is not a separate
  decision** — it falls on whichever side the threshold's value puts it, as the filter tier (0.4: Standard keeps its
  links) and the drift tier (0.8: Standard loses drift) already do.
- **No new tier, dial or control.** The three preset buttons and the two sliders stay; a held-off thing reads as the
  three existing ones do (a greyed control with "Held off by Audio Load", the stored value kept).
- **Reaching inside Tone** is allowed in the shape of the leak fix: a wrapper in `src/engine/tonePatches.ts`, applied
  once at boot, feature-detected, a `devWarn`ed no-op on a Tone that moved, documented as deletable at the Tone upgrade
  (backlog 34). Forking Tone, `patch-package`, or any new dependency is a question for Crawford first.

### 1.5 Phase B — the cut protocol

Cuts go in **Gate A's order** (2026-10-28): the inaudible ones first and alone (H2, standing-by voices released; H3a,
the dark cells' LFOs; H3b, the drift secondaries), each kept or dropped on its own A/B, then the phone (§1.6). One task
each, in this shape:

1. **RED test first** where the cut has behaviour (a tier flag, a release/re-reserve, a stop/start at a crossing);
   none where it has only a number (a constant's value is pinned by the test of the flag it drives).
2. **Build** the cut on the build branch, one commit.
3. **The desktop A/B:** branch against the branch's own base (the previous cut in), same session, three interleaved
   rounds, D1 and D5 at Light, 240 s. **Kept** when the mean capacity drops by at least the piece's Phase A price less
   the noise band, the peak window does not rise, `max lag` is inside the base's spread, and (for a tier cut) a Full
   run reads inside the base's spread. A piece Phase A read below noise on one world (H3a and H3b on D5) is kept there
   when that world reads inside its noise band, not worse. **Dropped** otherwise — the commit reverted, the number recorded.
4. **A crossing, where the cut has one** (an effects hold-off as the slider crosses the threshold; an LFO stop at a
   darken): the real-time-context recorder recipe (DARK_EFFECT_BYPASS.md §5 step 2), three runs, ≤ ×1.6, no gap.
5. **Recorded** in `scratchy-audio-phones.md` under the decomposition section, and the Phase A decision table updated.

Each cut's keep/drop is Crawford's call on the number, not the agent's on the reading; a dropped cut stays in the
table with its measured price so it is not re-proposed. Phase B ends at **Gate B**, Crawford's desktop listen: D1 and D5 at Full
and at Light, a few minutes each, nothing changed (Phase B holds only inaudible cuts): no click at a robot's admission
or stand-down, none when a dark pedal lights or drift comes back on.

### 1.6 Phase C — the phone, and what happens on a miss

The sitting protocol as it stands: two production builds on the LAN (the branch, and `main` as the baseline), `?debug&load=light`
plus the world link, Pixel 8 rested before each run, a fresh tab per run, hands off to 3:00, read again at 4:00,
Crawford's words recorded verbatim beside the overlay's count (a pointer, not evidence). Four branch runs (D1, D5,
each twice if time allows) and one `main` run per world in the same sitting. **Pass:** clean by ear on D1 and D5 for the
four minutes — no clicks, no distortion, no dropout; the count recorded and expected to read far under the sittings'
~200 at 3:00 but not gated. Also one branch run per world at **Full**, by ear, to confirm the every-tier cuts changed
nothing audible on the phone either.

**On a miss, Light cuts deeper** rather than accept clicks, in Gate A's order (2026-10-28): decoration before the
music. Three audible, Light-only cuts, each its own Phase B-shaped task (RED test, build, desktop A/B) on top of the one
before: (1) **pedals off at Light**, H1's effects tier; (2) **a shorter Reverb at Light**, a decay cap below an
Effects Load threshold; (3) **three sounding robots at Light instead of four**, `LOAD_AUDIBLE_ROBOTS_MIN` 2 → 1
(Light's cap `round(1 + 11 × 0.2)` = 3; Standard stays 8, Full 12). A sounding robot costs about 0.06 of desktop
capacity (scratchy-audio-phones.md, the decomposition's §6); the "about 2 capacity points" this section first cited came
from a smaller graph. All three are built before the phone, then **one rested sitting** tries three stacked builds in
that order, (1), then (1)+(2), then (1)+(2)+(3), and stops at the first that is clean on both worlds; only the cuts up
to it are kept, any past it reverted. If none is clean, the item returns to Crawford with the numbers: the graph's
floor on this phone is then known, and the next move (a robot's voice built on fewer nodes, native-node pedals) is a
spec of its own. Standard holding effects off too (the effects threshold raised past 0.6) is out of this work.

### 1.7 What does not change

The music: notes, melodies, harmony, swells, the lifecycle and the wall-clock day. The Full tier's sound. The tier's
existing cuts and thresholds (`maxAudibleRobots`, `maxPolyphony`, the three LFO flags, `LOAD_PLAYBACK_BELOW`). The
bypass cells' law and crossing (`cellGains`, `writeCellMix`) — a hold-off reuses them, never adds a second path. The
`Robot`, `GlobalAudioSettings` and session/share shapes: nothing new is stored, shared or saved; a held-off effect's Mix
stays what the user set. The gem: nothing on the body reads any of it.

---

## 2. Target File Structure

Phase A touches no product file. Phase B's files depend on Gate A; the list below is every file a hypothesis's cut would
touch, so the plan can name them per task.

```text
scripts/perf/
├── audio-handlers.mjs               # Phase A: the handler breakdown over CDP (new; the plumbing, verified by runs)
├── audio-handlers-lib.mjs           # Phase A: the pure tally — handler class, self time, share of Render, count (new, unit-tested)
├── audio-handlers-lib.test.mjs
├── audio-load.mjs                   # Phase A: prints the full live-nodes-by-type line after the warm-up (census)
└── audio-load-lib.mjs / .test.mjs   # the census formatter, if any pure part is added

src/constants/index.ts               # on a miss: LOAD_EFFECTS_MIN (H1), the Reverb cap's threshold and value, LOAD_AUDIBLE_ROBOTS_MIN 2 → 1
src/utils/audioBudget.ts             # H1: effectsEnabled on EffectsLoadLimits; describeLimits names it
src/utils/audioBudget.test.ts
src/systems/audioBudgetSystem.ts     # H1: push the flag (globalFx + store); H2: release/re-reserve on the sounding set's changes
src/systems/audioBudgetSystem.test.ts
src/store/audioStore.ts              # H1: effectsHeldOff + setter (the three existing booleans' pattern)
src/engine/audioEngine/globalFx.ts   # H3a: LFO stop/start at the crossing; on a miss, H1: setEffectsHeldOff, and the Reverb decay cap
src/engine/audioEngine/bypassCell.ts # H1: a held-off cell keeps its stored Mix and reads dark; H3a: the effect's LFOs stopped while dark
src/engine/audioEngine/globalFx.test.ts, bypassCell.test.ts
src/engine/lfoEngine.ts              # H3b: drift secondaries stopped while drift is held off
src/engine/lfoEngine.test.ts
src/engine/AudioEngine.ts            # H2: a standing-by robot's voice released; re-reserved on admission (existing APIs)
src/engine/AudioEngine.test.ts
src/engine/audioDiagnostics.ts, src/components/debug/hudLines.ts   # H1: `fx off` on the overlay's lfo line
src/components/.../AudioLoadPanel.tsx, the ten Mix rows' panels      # H1: HeldOffNote against effectsHeldOff
src/content/...                      # H1: the held-off copy and describeLimits' phrase (never a literal in a component)
src/engine/tonePatches.ts            # only if a cut needs a wrapper (none of H1–H5 does as written)

docs/todo/scratchy-audio-phones.md   # Phase A section + each cut's A/B + the sitting
docs/PERFORMANCE.md                  # the handler breakdown script, the census line, hygiene additions
docs/AUDIO_SYSTEM.md                 # "Audio Load Budget": the new flag(s); "The bypass cells": hold-off and LFO stop; the tone patch note if any
docs/todo/backlog.md, docs/todo/plan.md   # 27's Built line; Stage 1's line
```

---

## 3. Implementation Boundaries & Constraints

- **Phase A changes no product behaviour.** The scripts are tooling (TDD'd pure parts, plumbing verified by runs, the
  backlog 30/31 precedent); the ablation builds are throwaway — `src/` restored and the tree clean after each, nothing
  committed, each named in the record by the stock commit it was cut from and what it removed.
- **Every removal is proposed, never made unasked.** Gate A picks the cuts; each cut is kept or dropped by Crawford on
  its number. A cut outside H1–H5 that the decomposition suggests is added to the decision table as a proposal, not built.
- **CLAUDE.md's audio rules hold.** Every node and every AudioParam write lives in `AudioEngine`, `globalFx.ts`,
  `bypassCell.ts` or `lfoEngine.ts`; nothing is scheduled from a GSAP callback or a timer; the only timer a crossing
  uses is Tone's audio-clock `setTimeout`, as `writeCellMix` does today. State stays JSON-serialisable: a held-off flag is
  a boolean in `audioStore`, the nodes stay in the engine. `MIN_LEAD` applies to a re-reserved robot's first trigger.
- **The tier rule (§1.4) is the only gate.** No new tier, dial, preset or control; no new stored, shared or saved field.
- **Inside Tone only as a wrapper** (`tonePatches.ts` shape); forking, `patch-package` or a new dependency needs asking.
- **Measurement hygiene** (PERFORMANCE.md): production builds, same-session interleaved A/B, foreground, one call at a
  time, orphaned-Chrome check before and after, the code named by commit; the phone rested, a fresh tab per run, the
  count read as a pointer.
- **No file-text tests** (CLAUDE.md, 2026-10-23): a task with no behaviour (a constant's value, a record, docs) has no
  RED test; its proof is a run or a read, named in the commit.
- **Protected:** `.env*`, `node_modules/` (no rewrite under it), public build assets.
- **User-facing text** (the held-off copy, `describeLimits`' phrase) lives in `src/content/`.

---

## 4. Code Style & Architecture Conventions

A new tier flag follows the three that exist, end to end: a constant, a boolean on the limits, a push from the budget
system to the engine and the store, a greyed control. H1 as it would read (only if Gate A keeps it):

```typescript
// src/constants/index.ts — beside LOAD_DRIFT_MIN, LOAD_FILTER_LFOS_MIN, LOAD_BUS_FILTER_LFOS_MIN
/** Effects Load below this holds every bypass effect dark (the effects tier, docs/specs/LIGHT_TIER_STANDING_COST.md). */
export const LOAD_EFFECTS_MIN = 0.4;

// src/utils/audioBudget.ts — one more field, read the way the other three are
export function effectsLoadToLimits(effectsLoad: number): EffectsLoadLimits {
  const load = clampAudioLoad(effectsLoad);
  return {
    driftEnabled: load >= LOAD_DRIFT_MIN,
    filterLfosEnabled: load >= LOAD_FILTER_LFOS_MIN,
    busFilterLfosEnabled: load >= LOAD_FILTER_LFOS_MIN && load >= LOAD_BUS_FILTER_LFOS_MIN,
    effectsEnabled: load >= LOAD_EFFECTS_MIN,
  };
}

// src/systems/audioBudgetSystem.ts — applyLfoTiers' successor pushes it like the others: engine first, then the store
function applyTiers(limits: LoadLimits, force = false): void {
  // …the three existing lfoEngine calls…
  if (force || limits.effectsEnabled !== lastEffectsEnabled) setEffectsHeldOff(!limits.effectsEnabled); // globalFx.ts
  useAudioStore.getState().setEffectsHeldOff(!limits.effectsEnabled);
}

// src/engine/audioEngine/globalFx.ts — a hold-off is the existing crossing with the stored Mix kept, never a second path
export function setEffectsHeldOff(heldOff: boolean): void {
  effectsHeldOff = heldOff;
  for (const key of BYPASS_KEYS) writeCellMix(key, heldOff ? 0 : storedMix(key)); // ramps, then disconnects from the audio clock
}
```

- Names as the neighbours': `LOAD_*_MIN` constants, `*Enabled` on the limits, `*HeldOff` in the store, `set*HeldOff`
  setters, `HeldOffNote` beside a greyed control.
- A stop/start of an LFO at a crossing lives inside `writeCellMix`'s connect/disconnect, not beside it, so the two
  cannot drift apart.
- A release/re-reserve (H2) goes through `AudioEngine.releaseVoice` / `reReserveVoice` and `primeRobotLinks`, the
  paths every other rebuild uses; no new voice-management surface.
- Scripts: ESM `.mjs`, pure parts in a `-lib.mjs` with a `.test.mjs`, the CDP plumbing in the runner, `--help` text,
  documented in PERFORMANCE.md (the `perf:audio` pattern).

---

## 5. Testing & Verification Requirements

### 5.1 Phase A — the decomposition (runs, not tests; tooling TDD'd)

- **`audio-handlers-lib.mjs` (RED first):** given trace events, sums self time per handler class (a `Process` event's
  `dur` less its nested children's), divides by the `Render` total, counts distinct handler instances per class, sorts by
  share, formats the table; ignores events off the audio thread; an empty trace gives an empty table, not NaN.
- **The census line** in `audio-load.mjs`: the by-type map printed in full after the warm-up, sorted by count; pinned
  by a unit test on its formatter if one is added.
- **The runs:** the handler breakdown, three per world (shares' spread = noise); the eight ablations A1–A8, three
  interleaved rounds each against same-session stock, D1 and D5, 240 s; the census once per world; fact (a) once per
  world. **Criterion:** the ablation deltas explain ≥ 70 % of the stock mean on both worlds (§1.2); every number carries
  its spread; the record names every build's stock commit and what it removed.
- **Gate A:** the decision table (§1.2) read by Crawford; the cuts picked and ordered.

### 5.2 Phase B — per cut (RED first, one task each)

- **H1, the effects tier** (only on a phone miss): `effectsLoadToLimits(0.2).effectsEnabled` false, `(0.4)` and `(1)` true; `describeLimits`
  names "no pedals or colour" when off; `applyTiers` pushes `setEffectsHeldOff(true)` once on the crossing down and
  `(false)` once on the crossing up, idempotent on a re-send, forced on reconcile; `setEffectsHeldOff(true)` drives every
  lit cell and branch through `writeCellMix` to 0 (ramp, timer, disconnect) and leaves the stored Mix untouched;
  `(false)` restores exactly the stored Mixes through the same crossing; a Mix write while held off updates the stored
  value and connects nothing; `getConnectedEffectCount` reads 0 once the timers fire; the overlay line carries `fx off`;
  `applyGlobalAudioToEngine`'s whole-block re-send while held off connects nothing; a session restore and a share link
  while held off restore the stored Mixes dark and light them on the crossing up. UI: the ten Mix rows disabled with the
  note while `effectsHeldOff`; the Audio Load panel's readout.
- **H2, standing-by voices released:** on a sounding-set change, every robot leaving the set has `releaseVoice` called
  once and its links disposed; every robot entering it is re-reserved with its stored layers, sends, bus filter and
  links primed before any trigger; a `null` set releases nothing; `stopAudioBudget` re-reserves all; `triggerWithCap`
  on a standing-by robot still returns false without building; mute/solo paths unchanged; the voice counter never
  strands (a release while notes sound waits for `scheduleVoiceRelease`, or is deferred to the next measure tick — the
  plan decides, pinned either way).
- **H3a, dark LFOs stopped:** after build every cell's effect LFOs are stopped; the light crossing starts them before
  the connect; the darken crossing stops them when the disconnect fires (same timer); a re-light before the timer
  cancels the stop; an effect with no LFO is untouched; the Vibrato (starts its own) is covered.
- **H3b, drift secondaries stopped:** `setDriftEnabled(false)` stops the four secondaries and `(true)` starts them,
  idempotent, before and after `primeLfoBank`; the drift Gains' detach/attach unchanged.
- **The Reverb decay cap** (only on a phone miss): the limit set below its threshold and `null` above; the engine
  writes `min(stored decay, cap)` through the coalesced impulse path and restores the stored decay exactly on the
  crossing up; a decay write while capped records the value; one push per crossing.
- **The sounding cap** (only on a phone miss): `robotLoadToLimits(0.2).maxAudibleRobots` 3, `(0.6)` 8, `(1)` 12,
  `(0)` 1.
- **Every cut:** `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean; the mutation gate on the pure
  parts (the TDD workflow); the desktop A/B of §1.5 step 3 recorded; the crossing recipe of step 4 where there is one.

### 5.3 Gate B — Crawford's desktop listen

D1 and D5 at Full and at Light, a few minutes each: nothing changed by ear (Phase B holds only inaudible cuts); no
click when a robot is admitted or stands down; a dark pedal lit from its Mix (0 → 0.3) and back without a click;
Robot Load and Effects Load dragged across their thresholds both ways; save, reload and a share link across them. The
audible cuts' listen (the pedals gone, the Mix rows greyed with their values kept, the Reverb shorter, three robots)
belongs to §1.6's miss path, before its sitting.

### 5.4 Phase C — the phone (Gate C)

§1.6's protocol. **Pass:** clean by ear on D1 and D5 at Light for four minutes on a rested Pixel 8, and Full by ear
unchanged. Recorded in `scratchy-audio-phones.md` as the closing section of backlog 27, with the counts, Crawford's
words, the builds' hashes and the links. On a miss, §1.6's three stacked builds in one sitting.

### 5.5 Checks

Every task: types, lint, tests, build clean. Docs tasks: a read.

---

## 6. Git & Workflow Context

- **Docs** (this spec, the intent, then the plan) on `docs/backlog-27-intent`, off `main` `a5d5944d`; its PR is
  Crawford's. **Build** on `perf/light-tier-standing-cost`, off `main` once the docs merge (else off the docs branch).
- **Order:** Phase A tooling (two tasks: the handler script with its lib and tests; the census line), then the runs
  (one task per instrument, each a recorded section), then fact (a), then the decision table → **Gate A**; Phase B one
  task per inaudible cut in Gate A's order, each with its A/B → **Gate B**; Phase C → **Gate C** (on a miss, §1.6's
  three audible cuts and one stacked sitting); then docs (AUDIO_SYSTEM.md,
  PERFORMANCE.md, backlog 27's Built line, plan.md's Stage 1 line deleted) and the archive move at merge.
- One commit per task, short imperative messages naming the proof ("the A/B", "a run", "a read"). Throwaway ablation
  builds are never committed. The PR is Crawford's.
- Follows CLAUDE.md's workflow skills: TDD per task, incremental, stop at each gate.

---

## 7. Open Questions

1. **Is `disabled-by-default-webaudio.audionode` still a live trace category on current Chrome?** Verified 2026-09-18
   on Chrome 153; if it has gone, the breakdown falls back to the ablations alone (instrument 2) and the census, and the
   per-node price comes from the September figure (~1–2 µs per node per quantum) flagged as stale. Settled by the first
   run of the script.
2. **H1's threshold.** 0.4 (Light holds effects off, Standard keeps them, matching the filter tier) is the
   recommendation: the phone's own default is Light, and Standard was heard clean at `playback` on `charlie` in
   September. Raising it to hold Standard off too is §1.6's lever (3), taken only on a Standard miss. **Gate A
   (2026-10-28):** 0.4 stands, for the miss path only; holding Standard off is out of this work.
3. **H2's admission.** Build a robot's voice when it *enters* the sounding set (one connect into the live graph, before
   its first trigger) or keep a small pool of warm chains? Recommendation: build on entry — the set changes on the
   measure tick, `MIN_LEAD` covers the first note, and backlog 29 found no lost quantum on a connect. Pinned by the plan.
4. **Reopening backlog 28** (EQ3, LPF, HPF stay in at neutral). Only if A6 reads large; Crawford's archived decision,
   reopened on a number or not at all. **Resolved at Gate A (2026-10-28): not reopened.** The EQ levels are seeded, so
   the worlds are not at neutral and the cut would rarely apply.
5. **The Reverb at Light.** Only if A5 reads large; a decay cap is audible and Light-gated. September read it at 2–7
   points on a smaller graph. **Resolved at Gate A:** a decay cap at Light, the second of §1.6's three miss-path cuts;
   its value is set by that task's sweep and Crawford's ear.
6. **Numbering.** This is backlog 27's own fix: no new number, 27 gets the Built line and archives at merge, and
   plan.md Stage 1's line points at this spec. A roadmap phase instead would be warranted only if Gate A picks H2, which
   changes how voices are managed; recommendation: stay on 27 either way.
7. **The 70 % criterion for Phase A.** A judgement: enough to order the cuts, not a claim the parts sum. Crawford may
   set it higher or drop it to "ordered, with spreads". **Gate A:** under 70 % on D5 after T7, so Crawford had the
   remainder chased: A9 (every robot's voice refused) split Light's load into the robots (about 70 %) and the floor
   (about 30 %), every part priced or named (the decomposition's §6).
