# Intent: Deterministic Robot Melody Generation

Confirmed via `interview-me` on 2026-09-28, ahead of a `spec-driven-development` pass. Roadmap [Phase 31](../todo/roadmap.md#31-deterministic-robot-melody-generation), converged via an earlier `/idea-refine` session; this pass resolved the one architectural fork that session left open (see "Known implementation note" below) before treating the phase as ready to spec.

## Outcome

A robot's melody becomes a pure function of its own attributes, with exactly one generation mechanism instead of two. A new `compositionSeed` field — its own `getSeededVal` draw against the noise map, own dataId, set once at spawn exactly like `id` (`src/systems/spawnSystem.ts`) — becomes the shared seed for **both** a robot's initial spawn-time melody and every later `regenerateMelody.ts` call (`src/engine/regenerateMelody.ts`), replacing `spawnSystem.ts`'s current ad hoc `melodyCallIndex`/noise-map-`rand` mechanic for the initial melody and `regenerateMelody.ts`'s current unseeded `Math.random()` fallback for every edit-triggered regeneration. The formula in both places: `compositionSeed` plus the robot's current `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `pitchRepeat`, and `octaveRange`, fed into `generateMelodyForRobot`'s already-existing (currently unused for edits) `opts.seed` parameter.

## Behavior

- Same attribute values always produce the same melody for a given robot — from the moment of spawn, through any number of later edits and reverts. Nudging a slider to a new value and then back to its prior value reproduces the exact melody it had before, with **no "first-edit ratchet"**: because spawn-time and edit-time generation now share one formula, touching a slider once and reverting it does not permanently shift the robot off the melody it was born with (today, spawn-time generation and edit-time generation are two separate mechanisms, so this ratchet exists as a latent gap even before considering the `Math.random()` bug).
- `applyOctaveMin`/`applyOctaveMax` (`src/systems/robotOptionsActions.ts`) start calling `regenerateMelody` too, closing a second pre-existing gap — octave-range edits currently don't touch melody at all, even though octave range is one of the five formula inputs.
- Bulk company edits (`CompanyOptionsSection.tsx`) already call `applyDensity`/`applyMotifLength`/`applyNoteVariance`/`applyPitchRepeat`/`applyOctaveMin`/`applyOctaveMax` once per member robot, each with that robot's own live object — confirmed by reading the call sites, not assumed. Once those setters are seed-aware, bulk-editing a company to identical settings automatically produces melodies that share rhythmic character without being identical note-for-note ("complementary, not unison") purely because each robot keeps its own distinct `compositionSeed` — **no changes needed to the bulk-edit path itself.**
- A Session Storage save/load round trip (roadmap Phase 20) reproduces a robot's exact melody with **no changes to `SessionPayload`'s shape** — this only holds because `compositionSeed` is itself deterministically re-derived from the seed/coordinates on every regeneration, the same as `id` is, rather than being a value frozen once via `Math.random()`. (If it were the latter, a session reload would silently reproduce the right attribute values but the wrong underlying seed, producing a different melody than what was saved — exactly the kind of quiet regression this phase exists to prevent.) This also means a plain page reload of the same locale (no saved session involved) reproduces the same starting melody, consistent with every other seed-derived robot attribute.
- The standalone Reset Melody control (`handleResetMelody`/`onResetMelody` in `RobotOptionsTab.tsx`, currently wired to a bare `regenerateMelody()` call) is removed outright. Under full determinism there's nothing left for it to do that changing an attribute doesn't already do, and no replacement was requested.

## Style / constraint

- No new stored melody data of any kind — the melody itself is never persisted; only the recipe (`compositionSeed` plus the five existing attribute fields) is. This matches the "store the recipe, not the derived state" convention Session Storage and `PROCEDURAL_GENERATION.md` already establish elsewhere.
- `compositionSeed` follows the exact existing precedent of `generateRobotId`/`filterFreq`/every other per-robot seed-derived field: its own `getSeededVal(noiseMap, '<dataId>', offset, ...)` draw, computed once at spawn and stored as a plain field on `Robot`, not recomputed from a live noise-map lookup at edit time (the whole point is that `regenerateMelody.ts` can stay a pure function of a `Robot` object, with no `noiseMap`/`localeId`-threading beyond what it already has).
- No global settings→melody map with no robot identity — each robot's `compositionSeed` is what keeps two robots with identical dialed-in attributes from sounding identical to each other.

## Out of scope

- **Persisting melody data directly** — rejected: exactly the anti-pattern this app was built to avoid.
- **A global settings→melody map with no robot identity** — rejected: would make any two robots with identical attributes sound identical to each other, which reads as a bug on a 12-robot roster.
- **An explicit "Reroll" action** to replace the removed Reset Melody button — not requested; full determinism was the explicit goal, not preserving an escape hatch for randomness.
- **Melody history / navigating a robot's past melodies** — split out to [roadmap Phase 32](../todo/roadmap.md#32-robot-melody-history--configuration-scrubber), which depends on this phase shipping first.
- **Any new user-visible UI** beyond removing the Reset Melody button — this phase is a correctness fix, not a new control surface.
- **LFO settings, robot name, or any field outside the five-input list** (`rhythmicDensity`/`rhythmicMotifLength`/`noteVariance`/`pitchRepeat`/`octaveRange`) — none of these become new melody inputs.

## Known implementation note (not yet spec'd)

- The exact mechanism for combining `compositionSeed` and the five current attribute values into a single value compatible with `generateMelodyForRobot`'s `opts.seed: number` (or `opts.rand: () => number`) parameter is not yet decided — a spec pass should read `melodyGenerator.ts`'s full options contract (`opts.seed` is converted via `alea(String(opts.seed))`) before choosing a combination approach.
- `spawnSystem.ts`'s refactor needs `compositionSeed` computed and available *before* its own initial-melody generation call (currently around line 606–621, ahead of the `Robot` object literal that assigns `id` at line 627) — likely a new `generateCompositionSeed(noiseMap, spawnCount)` mirroring `generateRobotId`'s shape, called early enough to feed both the initial `generateMelodyForRobot` call and the `Robot` object's own `compositionSeed` field.
