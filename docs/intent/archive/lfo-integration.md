# Intent: LFO Integration (Roadmap Phase 0)

Confirmed via `/interview-me` on `feature/LFO`, 2026-08-20. This is the "why" behind
Phase 0's scope in [docs/todo/roadmap.md](../todo/roadmap.md#0-lfo-integration) —
read that first for the file-level deliverables; this doc resolves the decisions its
prose left open.

## Outcome

Build Phase 0's LFO engine (`src/types/lfo.ts`, `src/engine/lfoEngine.ts`,
`src/data/lfoConfig.ts`, `lfoEngine.test.ts`) with real Tone.js signal-chaining onto
every target flagged `Has LFO` in the reference grids:

- [ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md) — 13 per-robot targets: Volume,
  plus each of the 3 oscillator layers' Gain/Detune/Phase/Interval (pulse width).
- [GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md) — 9 global-chain targets:
  EQ low/mid/high, LPF frequency/Q, HPF frequency/Q, Chorus delayTime, Delay delayTime.

LFO rate is free-running Hz (`0.1–10 Hz` per the grid) — the transport only gates
start/stop, it does not tempo-sync the rate.

Alongside the LFO engine, extend seed generation to **all** of `GlobalAudioSettings`
(~29 fields across all 7 effects: Compressor, EQ3, Filter LPF, Filter HPF, Chorus,
Delay, Reverb) sampled from the **planet** noise map — a new direct sample, since
today the planet map is only used to derive locale maps (see
[PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md)), never sampled directly for
a value. Wire this live into `audioStore` on planet load, replacing the static
`DEFAULT_GLOBAL_AUDIO_SETTINGS` as the source of the live per-planet values. Per-param
min/max and log-vs-linear sampling scale are chosen by referencing Tone.js's own
documented ranges, cross-checked against `GLOBAL_CHAIN_GRID.md`'s existing
Logarithmic/linear UI annotations.

Robot-level LFO settings (shape/rate/depth per target) generate via `spawnSystem.ts`'s
existing locale-seeded `getSeededVal` pattern — the same mechanism that already
generates the rest of a robot's `AudioAttributes`. Global-chain LFO settings generate
from the planet map alongside their now-seeded parent effect values.

All 7 global effects' `enabled` flags are forced `true` for now (not seeded) so the
complete seeded chain is audible for evaluation — a deliberate, temporary override,
not the long-term design.

## User

Crawford, auditioning and tuning the procedurally-generated audio character directly
as this lands. This is engine-level work exercised by ear/tests, not end-user-facing —
no UI consumes any of this yet.

## Why now

`feature/LFO` was already open against Roadmap Phase 0 when this interview ran. Phase 0
is explicitly sequenced before any UI primitives or synthesis drawers exist, per the
roadmap's own "About" section.

## Success

- Every flagged target (robot + global) has a real, connectable Tone LFO node.
- Global effect base values *and* their LFO settings vary deterministically by planet
  seed; robot-level LFO settings vary by locale seed — same guarantee the rest of
  procedural generation already gives.
- Everything is audible for evaluation, since all 7 global effects are forced on.
- `lfoEngine.test.ts` covers signal scaling and getter/setter behavior in isolation.
- `docs/AUDIO_SYSTEM.md` gains an "LFO Modulation" section documenting the new API.

## Constraint

Stays inside the repo's existing non-negotiable guardrails ([CLAUDE.md](../../CLAUDE.md)):
- No Tone objects constructed outside `src/engine/`.
- No timers (`setTimeout`/`setInterval`/`requestAnimationFrame`) for musical timing —
  transport gates LFO start/stop, nothing more.
- State stays serializable — Tone LFO node instances are runtime-only and never enter
  Zustand; only their settings (shape/rate/depth/target) do, later.
- Seeding follows the existing `getSeededVal`/noise-map registry conventions
  (`precomputeDataX`, stable dot-namespaced `dataId` keys, no renames without
  treating it as a world-gen-breaking change).

## Out of scope (this phase)

- Any UI: LFO Component (Phase 1), Audio Rig drawer (Phase 4), Robot Options drawers
  (Phase 9). Wiring those up is explicitly deferred.
- Seeding the `enabled` toggles on global effects — pinned `true` for now.
- Tempo-synced LFO rate (note-division rates like `8n`) — rate is plain Hz.
- Compressor and Reverb as LFO targets — the grid marks both "–" (no LFO-flagged
  params on either).
