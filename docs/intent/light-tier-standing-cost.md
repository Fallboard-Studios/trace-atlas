# Intent: The Light Tier's Standing Cost — What Light Still Carries on the Phone

Confirmed via `interview-me` on 2026-10-27 (5 questions, five guesses confirmed), ahead of a `spec-driven-development`
pass. Backlog [27](../todo/backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included), plan.md
[Stage 1](../todo/plan.md) — the one item left in that stage. The measurement behind it is finished: desktop steps 1, 2
and 2b (2026-10-23) and the Pixel sitting (2026-10-26), all in
[docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md); the decisions they produced are on the backlog
item. This page records what Crawford wants done with the result, not the result itself. Spec:
[docs/specs/LIGHT_TIER_STANDING_COST.md](../specs/LIGHT_TIER_STANDING_COST.md) (written 2026-10-27, awaiting approval).

## Outcome

The phone's own default tier is clean on the phone. A fresh world opened on a Pixel 8 at Light — the tier a coarse
pointer picks by itself — plays without clicks, on the two worlds the sittings used (D1 `56c2t2t8` at (−116, −2),
D5 `bravo` at (−150, 90)), for a four-minute run. What the Light tier carries today is cut until that is true.

- **User:** anyone who opens a world on a phone and never touches a setting. Today they get "scratchy throughout" from
  the first seconds (both sittings on `main` at Light, 2026-10-23 and 2026-10-26).
- **Why now:** the measurement is done and every reasoned fix has been tried. Two rested sittings say the clicks are
  the graph's standing cost at Light, not a leak (the oscillator leak fix, backlog 32, merged and inaudible), not an
  accumulation (no trend in fifteen desktop minutes), not the dark pedals (the Dark-Effect Bypass helps only a dark
  world), and not the late collapse (unreproduced since 2026-10-22). The tier's own cuts — four sounding robots, eight
  voices, `playback`, filter and drift LFOs off — leave about 1 790 live nodes and `fx in 5/10` on the phone, and the
  desktop's audio thread at about half a core, bursting to full, with four robots sounding. The next move has to come
  from a decomposition of that standing cost, which is a change to how the audio graph is built, so it gets a spec.
- **Success:** the sitting protocol read the other way. The baseline is the two `main` sittings at Light (D1 191 → 261
  and D5 136 → 180 underruns at 3:00 → 4:00 on 2026-10-26, "too scratchy right out of the gate and throughout"); the
  result is Crawford's ear on the same four-minute runs, same worlds, same tier, rested phone: clean. The overlay's
  underrun count is read as a pointer, never as the evidence (backlog 29). The desktop's `npm run perf:audio` is the
  instrument that picks the cuts, not the criterion: a phone that is clean with the desktop reading 0.6 passes; a phone
  that clicks with the desktop reading 0.3 fails.

## Method

- **Decomposition first, cuts from the numbers.** The spec's first task is a measurement with no product change: the
  desktop at Light, D1 and D5, priced stage by stage — what the ~0.5 of a core is made of. The last census of the whole
  graph is from 2026-09-18 (about 1 400 nodes, 260 always-running `ConstantSource`s, almost all from `spawnRobot`,
  reverb worth 2–7 points, 12 quiet robots 24 % against 3 at 16–20 %) and predates the Audio Palette series (roadmap
  50.1–50.7), the rooms and the ceiling; the post-50.x numbers are per effect only. Until the decomposition exists the
  cut list is empty. Every cut so far that was reasoned rather than measured (lazy voice chains, the bypass, the leak
  fix) came to a few points or nothing audible.
- **The candidates are written into the spec as the hypotheses the decomposition tests**, not left for later:
  1. **Lit pedals and colour effects are ungated by Effects Load.** The dial holds off drift and filter LFOs only; no
     `LOAD_PEDAL_MIN` or `LOAD_COLOUR_MIN` was built, so a Light world still runs every lit pedal and room. D1 and D5
     both carried five of ten lit. Desktop lit prices: Phaser 45.8 ‰, AutoWah 24.9, Chorus 16.7, Tremolo 16.1,
     Shifter 15.8, Width 11.8, BitCrusher 9.8, Vibrato 9.8 (2026-10-20). Which five D1 and D5 light is not recorded.
  2. **Every robot's full voice chain is built at spawn** — three `Tone.Synth`s, a Filter, a Panner, five sends — for
     twelve robots when Light lets four sound; standing-by robots keep theirs ("Phase B" was deferred as a weak lever
     in September, measured on a smaller graph).
  3. **Always-running oscillators nothing audible uses**: the dark pedals' own LFOs (most of the 38 ‰ all ten dark
     still cost), the four lanes' drift secondaries (detached at Light, still running), and the `ConstantSource` behind
     every Tone `Signal` and `Param` (oscillator frequency and detune, filter parameters, envelopes), started at
     construction and rendered every quantum forever.
  4. **Biquads driven at audio rate** recompute their coefficients per sample: the LPF/HPF and bus links are suspended
     at Light, so this bites through a lit Phaser or AutoWah; k-rate would save about 60 % of those (measured on
     native nodes) and is unreachable through Tone's wrapper today.
  5. **The base chain itself**: EQ3's MultibandSplit, LPF, HPF, two compressors, the ceiling, the Reverb convolver
     (decay seeded 0.5–4 s), the FeedbackDelay, three rooms, and their cuts — priced once, in September, as small.
- **Cuts go biggest first**, each measured on the desktop before it is kept and the set confirmed on the phone at the
  end, until the phone is clean. A cut nobody can hear applies to every tier; an audible one is gated by the Light tier.
- **Standard and Full.** Full stays everything-on. Standard needs no separate decision: it follows whatever thresholds
  the Light cuts introduce, as the existing filter and drift tiers do.
- **If that is not enough, Light cuts deeper** — fewer sounding robots, no pedals — rather than accept clicks. The
  phone's default tier has to be clean on the phone.

## Style / constraint

- **Light may sound plainer than Full, never broken.** A phone listener who never hears the Phaser is fine; one who
  hears it stutter is not. Nothing changes the music: notes, melodies, harmony, the lifecycle and the day are untouched,
  and no audible change reaches Full.
- **Inaudible cost cuts are not tier-gated.** Pre-v1, no "keep existing sound" constraint: a change nobody can hear is
  not a change to the sound, so it needs no gate and applies everywhere.
- **Reaching inside Tone is allowed in the shape of the leak fix**: an in-app wrapper in `src/engine/tonePatches.ts`,
  no new dependency, documented as something the Tone upgrade (backlog 34) may delete. Forking Tone or adding
  `patch-package` needs asking first.
- **Removals are proposed, never made unasked.** Each cut is a decision Crawford takes on the number, not a step an
  agent takes on a reading.
- **CLAUDE.md's audio rules hold**: every node lives in `AudioEngine` / `globalFx.ts` / `lfoEngine`, scheduling stays
  on the transport, state stays JSON-serialisable, nothing on the gem reads any of it.
- **Measurement hygiene as before**: production builds, same-session interleaved A/B, foreground, orphan-Chrome check,
  the code named by commit, throwaway variants never committed; the phone rested, a fresh tab per run.

## Out of scope

- **The late collapse** (2:50–4:00 into a run, round 4 and T21). Unreproduced in two rested sittings since 2026-10-22;
  it stays recorded as unexplained on backlog 27 and is not this work's to fix. Its conditional steps (the Incognito
  tab, the cool-phone sine ramp) stay conditional.
- **The Tone upgrade** (backlog 34): waits for a release with the leak fix as npm `latest`; this work may add to what
  that upgrade deletes, nothing more.
- **The desktop's main-thread pops** (backlog 37 and 38 built; 39 parked, measure first).
- **A new tier, a new dial or new UI.** The cuts are expressed through the thresholds the two sliders already carry
  (the pattern of `LOAD_FILTER_LFOS_MIN`, `LOAD_DRIFT_MIN`, `LOAD_BUS_FILTER_LFOS_MIN`); the Audio Load panel's
  readout may name a new held-off thing, as it names the existing three.
- **Per-sample biquad work on filters nothing modulates** is a hypothesis to price, not a promised fix.
- **The 30-minute heap run** (backlog 27's optional step 3): settles nothing here.

## Open for the spec

- Which five effects D1 and D5 light at Light (derivable from the seeds; decides whether hypothesis 1 is aimed at
  anything).
- The decomposition's method: the dark-cost probe's `OfflineContext` renders of raw Tone pieces, or the app itself
  with pieces ablated, or both.
- How a cut that holds off a lit effect at Light is heard crossing the threshold on a live slider (the bypass cells'
  crossing already exists for Mix; a tier hold-off would reuse it).
