# Intent: Seeded Audio Swells

Confirmed via `/interview-me`. Started as "give Delay Mix and Reverb Mix an LFO target" — reconsidered mid-interview once it became clear the wanted behavior (rare, discrete, self-reversing events) doesn't fit `lfoEngine.ts`'s model (continuous, always-on, audio-graph-only modulation with no Zustand/UI visibility). This is a new, separate mechanism, not an extension of the existing 20-target LFO engine.

## Outcome

A fully autonomous "swell" system: periodically and deterministically, one eligible parameter ramps up, then ramps back down, and lands **exactly** back on its pre-swell value — never a net change. Two independent pools, each with its own eligible-target set and its own concurrency cap:

- **Global effects pool** — 9 eligible targets: the 7 targets already LFO-eligible today (EQ3 low/mid/high, LPF frequency/Q, HPF frequency/Q) plus two new ones, Delay Mix (`delay.wet`) and Reverb Mix (`reverb.wet`) — the params that started this whole conversation. An effect that's currently disabled/bypassed is not eligible for its own params to be picked.
- **Robot attributes pool** — 17 eligible attributes per robot: the 13 targets already LFO-eligible today (Volume, each of the 3 layers' Gain/Detune/Phase/pulseWidth) plus the 4 ADSR sub-fields (Attack/Decay/Sustain/Release), each independently eligible — not one atomic "envelope" swell. Selection spans the whole 12-robot roster, not per-robot. Robot Ping Controls (density, motif length, note variance, octave range) are never eligible. A small chance turns a pick into a **company-wide swell** instead — the same attribute, moving in lock-step, across every eligible robot in one randomly-selected Company — still counted as a single swell against the pool's cap.

A swell's live value updates flow through the same store-backed state the corresponding UI control already reads (the same path a manual slider drag would take), so the relevant slider/control visibly moves on its own while a swell is active on it — no new UI is built; existing controls double as the indicator.

## User

Same audience as the rest of the app's seeded-generation systems (harmony-by-hour, velocity variance, global FX seeding): the person listening to the soundscape. The console occasionally, audibly does something to itself — a Mix knob or an EQ band or a robot's envelope visibly crawls up and back down — with no dial anywhere to cause or control it directly.

## Why now

Reconsidered scope, discovered live during `/interview-me`: an LFO's constant, cyclical, audio-graph-only modulation was the wrong shape for "occasionally the mix swells up over some measures and settles back down." What was actually wanted is a rare, discrete, bounded *event*, and it was decided that event type shouldn't be scoped to just the two mix knobs that started the conversation — it should generalize across the global chain and robot attributes, with the same rules governing both.

## Success

- Roughly every 3–4 measures, each pool independently checks whether a new swell can start (two pools, two independent checks — not one shared roll).
- Each pool is capped at up to 5 concurrent swells; a check that would exceed the cap simply doesn't start a new one.
- A global swell picks one of the 9 eligible targets, skipping any currently-disabled/bypassed effect. A robot swell picks one (robot, attribute) pair from the 17-per-robot pool across all 12 robots.
- A swell has two phases only — ramping up, then ramping back down to the exact pre-swell value, no hold/plateau. The up-phase and down-phase measure counts are drawn independently (never mirrored), each 3–6 measures by default (never below 1), widened to 6–12 measures for Delay Mix / Reverb Mix specifically — tempo-relative, computed in measures, never a wall-clock timer.
- Direction and magnitude follow one rule for almost every attribute: the swell is pointed toward whichever edge (min or max) lets it cover at least 50% of the attribute's full range, and the actual peak is drawn somewhere between that 50%-of-range floor and the true edge. Robot Volume is the one exception — same rule, except a downward swell's peak is clamped so it never drops below 50% of Volume's own range.
- Everything — which pool fires, whether a robot pick becomes company-wide, which target/robot/attribute/company gets picked, direction, magnitude, and the timing of the up/down phases — is deterministic, derived from the Attenuation Style seed (matching how `generateGlobalAudioSettings`/`generateGlobalLfoSettings` already seed the rest of the global FX chain), never `Math.random()`. Two sessions on the same seed produce the identical swell timeline; a user's own manual edits are the only thing allowed to make two sessions diverge.

## Constraint

- Must be scheduled via `BeatClock`/measure-counted ticks (`scheduleRepeat`, matching `processMelodyStep`'s and panning's existing tick patterns) — no `setTimeout`/`setInterval`/`requestAnimationFrame`, per this repo's non-negotiable audio-timing rule.
- Must not use `Math.random()` anywhere in the trigger/selection/timing logic — seeded via `getSeededVal`/the Attenuation Style noise map, the same convention every other seeded field in this app already follows.
- Live swell writes must flow through the same state path the existing sliders read (so the UI visibly reflects the swell), which is a deliberate divergence from how `lfoEngine.ts`'s existing modulation works today (audio-graph-only, invisible to any control).
- Not built on `Tone.LFO`/`lfoEngine.ts` — a separate mechanism, independent of the existing 20 `LfoTargetId` targets and their `LfoSettings`/drift-group machinery.

## Out of scope

- Compressor and Limiter — never eligible, same dynamics-processor exclusion the LFO engine already applies.
- Delay's `delayTime` — stays excluded from any modulation, per its earlier deliberate removal (commit `508bd93`); only Delay's `wet`/Mix is newly eligible.
- The original plan (give `delay.wet`/`reverb.wet` a custom per-target Rate range on `lfoEngine.ts`, including a new per-target Rate-range table) — fully superseded, not built alongside this.
- Any new dedicated UI component, toggle, or per-swell control — existing sliders/controls are the only visible surface.
- Reseed/retransmit interaction with in-flight swells, and mid-swell interaction with a live manual slider edit — still open, deliberately left for Plan/Tasks (see `docs/specs/AUDIO_SWELLS.md` §7).
- Whether ramp interpolation within a phase is linear or eased — not decided; defaults to linear until confirmed otherwise.

Resolved via a follow-up `/interview-me` pass (2026-08-29), superseding the two items originally deferred here:
- Ramp-shape proportions and swell magnitude/swing formula per attribute type — see `docs/specs/AUDIO_SWELLS.md` §1.5 for the confirmed direction/magnitude/duration rules (a default rule plus Delay Mix/Reverb Mix and Robot Volume exceptions) and the new company-wide swell variant.
