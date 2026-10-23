# Intent: Output Headroom — No Clipping Out of the Box

Confirmed via `interview-me` on 2026-10-23 (5 questions, every guess confirmed), ahead of a `spec-driven-development`
pass. Roadmap [54](../todo/roadmap.md#54-output-headroom-no-clipping-out-of-the-box), Stage 1 of
[docs/todo/plan.md](../todo/plan.md): the first thing built after the cleanup branch merged, alone. Raised by Crawford at
Robot Effect Sends Checkpoint A (2026-10-21): a world "is distorting a lot - not dropping out, the gain is too high".
"Compress more out of the box" was the first phrasing, not a requirement about the mechanism.

## Outcome

Every world plays without the hard-clip crunch: out of the box at the seeded defaults, and after the user pushes the EQ
or the robot Volumes hot. Two fixed pieces of plumbing on the global chain do it: a **trim** into the chain that brings
the summed fleet below 0 dBFS, and a **true safety ceiling** at the end of the chain that catches whatever is left. The
seeded Compressor and Limiter stop carrying the safety job and stay what they are: musical, seed-varying, user-adjustable
dynamics.

- **User:** anyone listening to any world. Crawford first, because this is the one audible defect in every listen that
  follows, and quality is paramount.
- **Why now:** heard at Robot Effect Sends Checkpoint A, then measured: the master `out` peaks +2.2 to +3.4 dB and sits
  above 0 dBFS in 11-22 % of readings; the dry sum (`pre`, after the EQ, before the Compressor and the rooms) peaks +12 to
  +13 dB. Above 0 dBFS the browser hard-clips, which is the crunch. Robot Effect Sends is not the cause (the three new
  room Returns at 0 clipped as often).
- **Success:** a rebuilt level probe under `scripts/perf/` shows the master peak never above 0 dBFS on the measured world
  (`56c2t2t8` at (-116, -2)) and on a few other worlds, with the fleet at the seeded defaults and with the EQ and Volumes
  pushed up by hand. Crawford's desktop listen signs the sound off; a Pixel listen confirms no new underruns.

## Behavior

- **Quieter is fine.** Removing the clipping is allowed to take several dB off every world (roughly 6-10 dB from the
  measured `pre` peaks). The header's master volume slider makes it up where the listener's system allows. Loud-and-clean
  (real limiting with makeup gain to hold today's perceived loudness) is explicitly **not** the goal.
- **The fix is in the fixed chain, not only in the seeds.** Lower seeded Volumes or EQ ranges alone would clean a fresh
  world and still let a hand edit drive it into the crunch. The trim plus a ceiling at the end of the chain protects every
  world, edited or not.
- **Invisible plumbing.** The trim and the ceiling have no slider, no seed, no row in `GlobalAudioSettings`, no place in a
  session save or a share link, and no Output tab presence. A ceiling the user can turn off is not a ceiling; a trim the
  seed can vary reintroduces the problem. The Output tab keeps its three sub-tabs (Compressor, Width, Limiter) as they are.
- **The seeded Compressor and Limiter are untouched in role**, and their seeded ranges are a spec decision, not an intent
  one: they no longer need to prevent clipping, so a change is only warranted if they sound wrong once off safety duty.
- **"Compress more" is not the mechanism.** The Web Audio compressor applies automatic makeup gain (the Classic Band Retune
  found the old deep band swung fleet loudness by about 11 dB between seeds), so a deeper seeded threshold can raise the
  average level instead of lowering it. Tone's `Limiter` is the same compressor at 20:1 with a 3 ms attack and 10 ms
  release, makeup gain included: not a hard ceiling. The spec chooses the mechanism and the probe proves it.
- **The gate is a number, the sign-off is an ear.** "Never above 0 dBFS" is checkable; "sounds clean" is Crawford's. Both
  are required.

## Style / constraint

- **Nodes:** fixed single instances in `globalFx.ts`, built in `buildGlobalFxChain`, wired in `wireGlobalFxChain` in both
  Decay Modes, listed in `disconnectAllFxNodes`, guarded with `getToneCtor` for headless tests. No AudioParam write from a
  GSAP callback (Strict Separation); nothing in Zustand (nothing to store).
- **No new user-facing text**, so nothing in `src/content/`. No new control, trait, section tab or accent.
- **The probe is rebuilt and kept.** The CDP script that measured this lived in a lost session scratchpad. It comes back
  under `scripts/perf/` beside `audio-load.mjs`: load `?debug`, `retransmitWorld` from the store module, alternate settings
  live through `setGlobalAudio`, parse `out (\S+) rms (\S+)\s+pre (\S+)` from `.audio-debug-hud` (`hudLines.ts`). It is the
  gate's instrument, so it is checked in.
- **Phone gate as always.** A ceiling is one more node per sample. One Pixel run at Full, 3:00, HUD `underruns` written
  down, against a same-sitting `main` baseline (the standing recipe in
  [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md)).
- **Build alone on its own branch off `main`**, nothing else on it (plan.md Stage 1; the finish-the-branch rule).
- Pre-v1: every world's level changes by design; no "keep existing worlds the same" constraint.

## Out of scope

- **Backlog [23](../todo/backlog.md#23-audio-palette-trials-dynamics-processing-and-ducking)** (multiband Compressor,
  Gate, Follower ducking) is **not built here**. None of the three fixes clipping: multiband is three compressors with
  three makeup gains, the Gate is about silence between phrases, and ducking is a behaviour to audition in a clean world
  first. It stays in the backlog, re-sequenced after 54 is heard, with a note that multiband is only worth trying if the
  single Compressor sounds wrong once it is off safety duty. The spec pass amends the backlog text and plan.md.
- **Holding today's perceived loudness.** No makeup, no loudness normalisation.
- **Any Output tab change or new control**, including exposing the trim or the ceiling.
- **Changing the seeded robot Volume ranges** as the fix (allowed only as a spec-level tuning if the probe shows the trim
  alone cannot bring `pre` under 0 dBFS without squashing dynamics).
- **The 50.7 "preempt Phase 2" question** on the roadmap entry: moot, Robot Effect Sends merged (PR #570 carried roadmap
  55 after it). The spec pass closes that Open item.

## Known implementation notes (not yet spec'd)

- **The chain today** ([globalFx.ts](../../src/engine/audioEngine/globalFx.ts) `wireGlobalFxChain`, `:481`): entry cut →
  EQ3 → LPF → HPF → AutoWah → Phaser → Tremolo → Vibrato → Compressor → [Width] → Limiter → masterGain → Destination. Five
  rooms rejoin at the Compressor's input (Natural Decay) or the Width cell's input (Controlled Decay). The trim's natural
  slot is at the chain entry, before the EQ, so the `pre` tap (`connectTap(_globalEQ, ...)`, `:629`) reads post-trim and
  the existing HUD line proves the trim's effect; the ceiling's slot is after the Limiter and before `_masterGain`
  (`:398`), so the master volume slider stays the last thing before the Destination and the `out` tap (`:630`) reads the
  ceiling's output.
- **Construction today.** The Compressor is built at `:183` with hardcoded `threshold: -18, ratio: 6` and the Limiter at
  `:233` with `threshold: -12`; the store pushes the seeded values (`GLOBAL_AUDIO_LOADING_RANGES`: Compressor threshold
  -36 to -18 dB, ratio 2-6, Limiter threshold -3 to -1 dB) once the chain exists. Crawford's session had the Limiter at
  -17 dB; whether that was hand-set is unknown and does not change the design.
- **Ceiling candidates for the spec to A/B by probe and ear.** (a) A `Tone.Limiter` with its makeup compensated by a
  following fixed `Gain`, threshold at or just under 0 dBFS, accepting that a 20:1 compressor still passes transient
  overshoot. (b) A gentle final `WaveShaper` soft clipper (a `tanh`-style curve into a fixed `Gain`), a true ceiling with
  no makeup and no release-time grit on low notes, at the cost of a little harmonic colour on the loudest peaks only.
  (c) Both: Limiter for the body, clipper for the overshoot. The Tone fact that matters: `Limiter` is `Compressor` at
  `ratio 20, attack 0.003, release 0.01` (`node_modules/tone/build/esm/component/dynamics/Limiter.js:28-31`), and the
  Web Audio `DynamicsCompressorNode` applies makeup gain that cannot be disabled.
- **Trim size.** The `pre` peaks at +12 to +13 dB say about 10-12 dB of trim brings the dry sum under 0 dBFS on this
  world; the spec picks the number from the probe over several worlds, with margin for a hand-boosted EQ (+12 dB per
  band is the slider ceiling, `GLOBAL_AUDIO_SEED_RANGES` `eq3.*`).
- **Velocity headroom already exists upstream.** `NOTE_VELOCITY_BASELINE` is 0.8 since Robot Performance (about 2 dB
  fleet-wide); it is not the lever here.
- **The HUD** (`src/components/debug/hudLines.ts:86`) prints `out <peak> rms <rms>  pre <peak>  fin <finite>`; the taps
  exist only under `?debug` (`attachOutputTaps`, `:634`) so the probe costs nothing in normal play.
