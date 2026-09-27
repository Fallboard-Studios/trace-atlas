# Intent: LFO Modulation Engine (Stacked LFO Drift)

Confirmed via `/interview-me`. Source of prior (superseded) scope: an external plan draft, reviewed and found to contain several hallucinated file paths and an over-broad per-target UI design — see the review preceding this interview. Roadmap section: [docs/todo/roadmap.md § 10.2](../todo/roadmap.md#102-lfo-modulation-engine-stacked-lfo-drift).

## Outcome

One "Drift" accordion in the Audio Rig with two bipolar sliders — Rate Drift and Depth Drift, roughly -100%–+100% — that subtly drifts every currently-active LFO in the app, robot-level and global-chain alike, over a slow (~33 second) cycle. This is a single global control, not a per-target/per-robot one.

Under the hood: a small fixed pool of 8 shared hidden secondary oscillators (0.03Hz, deterministic — not randomized — phase offsets spread across the pool, not one secondary oscillator per active LFO), each currently-active primary LFO connected to one pool oscillator (picked deterministically by hashing its own instance key) through its own small pair of `Gain` nodes, so the swing amount still scales relative to that primary's own current rate/depth and range.

## User

The person listening to the soundscape (the developer, today) — this is ambient sound design, not a tool for tuning individual robots or targets.

## Why now

Phase 0's LFO engine (`docs/specs/LFO_INTEGRATION.md`) is fully wired across every robot and global-chain target now, and every one of those LFOs currently repeats with mechanical, perfectly-periodic precision. This phase closes that gap without adding a second raw oscillator sub-interface anywhere in the UI.

## Success

- Loading any planet already sounds subtly alive/non-repeating without touching anything — the two sliders exist as an override, not a requirement.
- No two LFOs read as synchronized to a listener. The 8-bucket phase pool is enough that shared-bucket collisions among (likely) 70-100+ simultaneously active LFOs are inaudible/unnoticed — true one-oscillator-per-LFO independence was explicitly decided against as not worth the audio-thread cost.
- A target whose own Depth is already `0` (silenced) stays truly silent regardless of global drift — Depth Drift only ever modulates targets already producing sound, it never brings a silenced target to life. This was a deliberate call, not an oversight: additive bounded-at-zero drift could have technically allowed a "silenced" LFO to flicker on, and that's rejected.

## Constraint

- Rate Drift/Depth Drift default values are planet-seeded, matching every other seeded value in the Audio Rig — one shared pair for the whole app, not per-target. Different Attenuation Styles should feel like they drift by different default amounts.
- The existing `Signal.override`/`Param`-reset fix `connectLfoTarget` already implements (`src/engine/lfoEngine.ts`, documented in `docs/AUDIO_SYSTEM.md`'s LFO Modulation section as "the worst LFO bug found here") must be reused for every pool-oscillator → primary connection. This is unaffected by the per-target → global redesign; the underlying `.connect()` onto a `Tone.Signal`/`Tone.Param` still resets the destination the instant it runs, regardless of what's on the other end.
- Oscillator cost is capped at a constant 8 secondary oscillators for the entire app, never scaling with how many LFOs happen to be bound/active at once. Per-primary `Gain` nodes (2 per active primary) still scale with active-LFO count, but gain nodes are cheap relative to oscillators.

## Out of scope

- Per-target or per-robot drift sliders (the original external plan's design — explicitly rejected during interview).
- Any changes to `src/data/robotOptionsConfig.ts`, `src/data/companyConfig.ts`, or `CompanyOptionsSection.tsx` — none of them need touching, since there is no per-target drift state to add.
- Per-LFO drift overrides of any kind.
- Any UI beyond the one new Audio Rig accordion.
