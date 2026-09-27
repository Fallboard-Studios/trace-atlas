# Intent: Multi-Group LFO Drift

Confirmed via `/interview-me`. Follow-up to the already-shipped [docs/specs/LFO_DRIFT.md](../specs/LFO_DRIFT.md) (roadmap [10.2](../todo/roadmap.md#102-lfo-modulation-engine-stacked-lfo-drift)), which scoped "Stacked LFO Drift" down to one shared pool of 8 secondary oscillators and one global Rate Drift/Depth Drift pair for v1. This phase builds the actual "stacked" part that name always implied: multiple independent drift layers, not one uniform one.

## Outcome

Replace the single shared drift pool and single global Rate Drift/Depth Drift pair with **4 independent drift groups**, each with its own dedicated pool of secondary oscillators, its own independently-seeded Rate Drift/Depth Drift amount, and its own pair of sliders in the Audio Rig:

- **EQ3** — the 3 possible EQ3 LFO targets (low/mid/high)
- **Low-Pass Filter** — the 2 possible LPF LFO targets (frequency/Q)
- **High-Pass Filter** — the 2 possible HPF LFO targets (frequency/Q)
- **Robots** — every robot-level LFO target (gain/detune/pulseWidth, any layer, any robot), sharing one group since robot fields have no "effect block" concept to split by further

## User

Same as the original phase — the person listening to the soundscape — now with finer control: EQ can wander differently than the filters, which can wander differently than the robots, instead of everything breathing in lockstep with one drift character.

## Why now

The roadmap named this phase "Stacked LFO Drift" from the start; the original `/interview-me` pass scoped it down to a single shared layer for v1 simplicity. This phase is the actual stack — multiple independent drift layers — that the name always implied.

## Success

- Each of the 4 groups can be dialed to drift by a different amount (or none), and it's audibly distinct group-to-group — EQ3's wobble doesn't sound like the robots' wobble.
- A fresh planet still sounds subtly alive with zero manual tuning — now with 4 independently-seeded flavors instead of 1.
- Every safety guarantee the shipped engine already has carries over per-group, unchanged: a target whose own Depth is `0` never gets revived by its group's Depth Drift; the `Signal.override`-disable-then-restore fix (`docs/AUDIO_SYSTEM.md`'s "worst LFO bug found here") is reused per-group connection, not re-derived.

## Constraint

- **Pool size is sized to each group's own real ceiling, not a uniform 8.** EQ3's and LPF/HPF's pools are small, matching their small, fixed target counts (a pool larger than a group's own possible target count has no purpose). The Robots group keeps the original 8 — it can have dozens of simultaneously active primaries across every robot/layer/field, the same "70-100+ primaries, a handful of buckets is enough" reasoning the original phase already established.
- Node cost stays a fixed constant *per group* — never scaling with how many robots or targets happen to be active at once. Total oscillator count becomes a larger fixed constant than v1's flat 8 (four pools instead of one), not an unbounded one.
- Each group's Rate Drift/Depth Drift default is independently seeded from the planet noise map — 8 seeded values total (4 groups × 2 fields), consistent with every other Audio Rig value already being independently seeded per planet.
- Every mechanic Phase 2 of the original spec already built and shipped — the deterministic bucket-hash assignment, the additive/bounded swing math (`centeredSwingFromRange`), the Depth Drift silence guard (disconnect, not zero, at Depth `0`) — is reused per-group, not redesigned. This phase restructures *which pool a primary hashes into and which drift amount applies*, not the underlying mechanism.

## Out of scope

- Per-robot or per-target drift (rejected in the original interview; still rejected here — "Robots" stays one shared group, not one group per robot).
- Any 5th/6th grouping beyond these 4 (e.g. splitting Robots further by field type, or splitting global effects further than one group per effect block).
- Any change to the `layerN.phase` exclusion (still no live Signal to attach drift to; still out of scope, same as the original phase's own §7).
