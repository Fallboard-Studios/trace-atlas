# Implementation Plan: Audio Rig V2 (Chorus Removal, Limiter, Chain Reorder, Seeded Bypass, Loading Ranges)

Source spec: [docs/specs/AUDIO_RIG_V2.md](../specs/AUDIO_RIG_V2.md) — fully resolved, no open items carried in (both ambiguities in its own §7 were confirmed by the user before this plan was written).

## Overview

Four changes to the already-shipped Audio Rig: remove Chorus everywhere (state, UI, seeding, engine, LFO targets), add Tone.Limiter as a new fully-editable effect with no LFO target, reorder the global chain to `EQ3 → LPF → HPF → Delay → Reverb → Compressor → Limiter` with a user toggle ("Natural Decay" / "Controlled Decay") swapping Compressor to before both Delay and Reverb, retire the Phase 0 force-`enabled`-true shim in favor of real per-effect seeding (Delay alone at 25%), and add a new narrower "loading range" table that bounds fresh-seed sampling without touching the UI's own full range. Two correctness fixes ride along, found while verifying every field against Tone.js's own source ahead of the loading-range work: `reverb.dampening` is removed entirely (verified against `Tone.Reverb`'s real source — it has no such property; the existing code has been silently setting a dead property since Phase 0), and `Delay`'s `maxDelay` becomes an explicit constant tied to `delay.delayTime`'s own range instead of an implicit, coincidentally-matching default.

## Architecture Decisions

- **Types first, everything else follows.** `globalAudio.ts`'s shape change (drop `chorus`, add `limiter`/`compressorBeforeDelay`) is what every other file's edit is checked against — sequencing it first means the compiler itself flags every downstream file that still references the old shape, rather than that surfacing ad hoc during later tasks.
- **The engine phase (Tasks 5–7) is highest-risk and sequenced early, deliberately.** `wireGlobalFxChain`'s two-topology rewiring and the `getMasterCompressor` → `getGlobalChainEntry` swap touch the one piece of this whole change that's genuinely novel (nothing in V1 ever disconnected/reconnected the chain after initial construction) and the one piece with a real failure mode if wrong (silent audio routing bugs, not compile errors). Landing and testing it before the store/UI layers build on it means those later layers are built against already-proven engine behavior, not a moving target.
- **`globalFx.ts` gets its own new test file (`globalFx.test.ts`), a deviation from V1's pattern.** Confirmed via a direct file check (not assumed): no `globalFx.test.ts` exists today — V1-era `globalFx.ts` behavior was only ever exercised indirectly through `AudioEngine.test.ts`'s broader `AudioEngine.start()` integration coverage. That was fine when `globalFx.ts` was pure construction (build once, never touch again). `wireGlobalFxChain`'s two distinct connect-order topologies are exactly the kind of thing that deserves direct, focused unit tests (assert the literal `.connect()` call sequence per topology) rather than being inferred indirectly through `AudioEngine.start()`. `AudioEngine.test.ts` keeps its existing integration-level coverage (does `start()` still work end to end); `globalFx.test.ts` owns the topology-correctness detail.
- **Seeding logic (Task 8) waits on both the range tables (Task 3, Task 4), not just one.** `generateGlobalAudioSettings` needs `GLOBAL_AUDIO_LOADING_RANGES` to exist (for value sampling) and `GLOBAL_AUDIO_SEED_RANGES` to already reflect the post-chorus/post-limiter field set (so the two tables' key sets provably match — Task 4's own subset-invariant test depends on this alignment existing first).
- **Store wiring (Task 9) is the one task with three upstream dependencies (5, 6, 8), not fewer.** It's the integration point: it needs the engine's new functions to call (`wireGlobalFxChain`, `setGlobalLimiter`), `AudioEngine`'s updated bypass-key union, and the seed function's new output shape (real per-effect `enabled`, no more force-override to remove against). Splitting it earlier would mean writing against functions that don't exist yet.
- **Docs (Tasks 12–14) are sequenced last and depend on the shipped code being final**, same reasoning V1's own Task 13/14 used — a doc describing behavior that doesn't exist yet inevitably drifts from what actually ships.
- **No new open questions surfaced while re-deriving the file-by-file list.** Spec §7's two items (Controlled Decay's scope, the toggle's dynamic label) were the only real ambiguities, and both are already confirmed. One minor, non-blocking judgment call is recorded in Task 5 below (whether `_masterCompressor`'s rename to `_globalCompressor` happens in the same commit as the rest of Task 5 or is skipped) — resolved there with a stated default, not left open here.
- **`reverb.dampening`'s removal and `maxDelay`'s fix ride along in whichever task already touches that field's file, rather than getting dedicated tasks of their own.** Both are small, single-field corrections discovered during the Tone.js verification pass ahead of this plan (see spec Overview) — folding them into Tasks 1/3/4/5/8/10/13 (wherever `reverb`/`delay` fields are already being edited for other reasons) avoids fragmenting the plan with near-empty single-line tasks, while still surfacing each change explicitly in that task's own acceptance criteria below.

## Dependency Graph

```
Task 1 (types/globalAudio.ts)
    │
    ├──→ Task 3 (data/globalAudioSeedRanges.ts) ──→ Task 4 (data/globalAudioLoadingRanges.ts)
    │                                                        │
    ├──→ Task 5 (engine/globalFx.ts) ──→ Task 6 (engine/AudioEngine.ts)
    │            │
    │            └──→ Task 9 (stores/audioStore.ts) ←── Task 8 (utils/globalAudioSeed.ts) ←── Task 3, Task 4
    │                          ↑                                                                    │
    │                     Task 6 ────────────────────────────────────────────────────────────────────┘
    │
    └──→ Task 10 (data/audioRigConfig.ts)
                    │
Task 2 (types/lfo.ts) ──→ Task 7 (engine/lfoEngine.ts)
                    │
Task 9, Task 10 ──→ Task 11 (AudioRigDrawer.tsx)
                          │
                          ├──→ Task 12 (docs/AUDIO_SYSTEM.md)
                          ├──→ Task 13 (docs/reference/GLOBAL_CHAIN_GRID.md)
                          └──→ Task 14 (docs/todo/roadmap.md + docs/SESSION_STORAGE.md)
```

## Task List

### Phase 1: Type & data foundations

- [x] **Task 1: `src/types/globalAudio.ts` — drop Chorus, add Limiter + compressorBeforeDelay, drop dead `dampening`** — done

  **Description:** Remove `ChorusSettings` and `GlobalAudioSettings.chorus` entirely. Add `LimiterSettings { enabled: boolean; threshold: number }` and `GlobalAudioSettings.limiter: LimiterSettings`. Add `GlobalAudioSettings.compressorBeforeDelay: boolean` (top-level sibling to `globalBypass`). Remove `ReverbSettings.dampening` — verified against `Tone.Reverb`'s real source (v15.1.22) that it has no such property; `globalFx.ts` has been setting it through an unsafe cast that Tone never reads (Task 5 removes the dead write, this task removes the type). Update `DEFAULT_GLOBAL_AUDIO_SETTINGS` accordingly — `limiter: { enabled: false, threshold: -12 }` (Tone.Limiter's own default), `compressorBeforeDelay: false`, `reverb` loses its `dampening: 3000` entry.

  **Acceptance criteria:**
  - [x] `ChorusSettings` and `GlobalAudioSettings.chorus` no longer exist anywhere in this file.
  - [x] `LimiterSettings` exists with exactly `enabled`/`threshold`; `GlobalAudioSettings.limiter` and `.compressorBeforeDelay` exist.
  - [x] `ReverbSettings` no longer has a `dampening` field; `ReverbSettings` now has exactly `enabled`/`decay`/`preDelay`/`wet`.
  - [x] `DEFAULT_GLOBAL_AUDIO_SETTINGS` has no `chorus` key, has a `limiter` key (`threshold: -12`, matching `Tone.Limiter.getDefaults()`), `compressorBeforeDelay: false`, and no `reverb.dampening`.

  **Verification:**
  - [x] `npx vitest run src/types/globalAudio.test.ts` — 8/8 passing.
  - [x] `npm run build:types` — confirmed the expected downstream error surface (globalFx.ts, audioStore.ts+test, globalAudioSeed.ts+test, audioRigConfig.ts, AudioRigDrawer.tsx, AudioEngine.test.ts, lfoEngine.test.ts) — every file already scoped to Tasks 5–11, nothing unexpected.

  **Dependencies:** None.

  **Files:** `src/types/globalAudio.ts`, `src/types/globalAudio.test.ts`

  **Estimated scope:** S

- [x] **Task 2: `src/types/lfo.ts` — drop `chorus.delayTime` from `GlobalLfoTargetId`** — done

  **Description:** Remove `'chorus.delayTime'` from `GlobalLfoTargetId` and `GLOBAL_LFO_TARGET_IDS` (9 → 8 global targets; 22 → 21 total with the 13 robot targets). Update the type's own doc comment (currently cites "9 targets... EQ3 low/mid/high, LPF freq/Q, HPF freq/Q, Chorus delayTime, Delay delayTime").

  **Found while verifying:** `src/data/lfoConfig.ts`'s own doc comment ("13 robot + 9 global = 22") went stale from this same change — its actual `DEFAULT_LFO_SETTINGS`/test derive the count dynamically from the arrays, so nothing broke, just the prose. Fixed in the same commit since this task's own change is what caused it.

  **Acceptance criteria:**
  - [x] `GlobalLfoTargetId` has exactly 8 members; `'chorus.delayTime'` is not one of them.
  - [x] `GLOBAL_LFO_TARGET_IDS` has exactly 8 entries, matching the type.
  - [x] Doc comment updated to the real 8-member list.

  **Verification:**
  - [x] `npx vitest run src/types/lfo.test.ts src/data/lfoConfig.test.ts` — 12/12 and 7/7 passing.
  - [x] `npm run build:types` — same caveat as Task 1, confirmed no unexpected files.

  **Dependencies:** None.

  **Files:** `src/types/lfo.ts`, `src/types/lfo.test.ts`

  **Estimated scope:** XS

- [x] **Task 3: `src/data/globalAudioSeedRanges.ts` — drop `chorus.*` and `reverb.dampening`, add `limiter.threshold`** — done

  **Description:** Remove all 5 `chorus.*` keys and the `reverb.dampening` key from `GlobalAudioSeedFieldKey`/`GLOBAL_AUDIO_SEED_RANGES`. Add `'limiter.threshold'` with a real full/UI-matching range, log/linear scale per this table's existing convention (a dB threshold parameter — compare against `compressor.threshold`'s existing `{ min: -60, max: 0, scale: 'linear' }` entry for precedent; Limiter's own sensible full range is a judgment call to make here, not deferred — this is the *full* range, not the new loading range, so it should mirror what the UI slider bound will be in Task 10). This table's meaning and its other consumer (`lfoEngine.ts`'s `resolveLfoOutputRange`) are unchanged — this task only edits its field coverage.

  **Acceptance criteria:**
  - [x] No `chorus.*` key or `reverb.dampening` key remains in `GlobalAudioSeedFieldKey` or `GLOBAL_AUDIO_SEED_RANGES`.
  - [x] `'limiter.threshold'` is present with a real `{ min, max, scale }` (`-20 to 0, linear` — per `GLOBAL_CHAIN_GRID.md`).
  - [x] Every remaining key's min/max is unchanged from before this task (this task only adds/removes keys, never edits an existing field's range).

  **Verification:**
  - [x] `npx vitest run src/data/globalAudioSeedRanges.test.ts` — 8/8 passing.
  - [x] `npm run build:types` clean for this file in isolation.

  **Dependencies:** Task 1 (needs the final field set `GlobalAudioSettings` now has).

  **Files:** `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioSeedRanges.test.ts`

  **Estimated scope:** S

- [x] **Task 4: `src/data/globalAudioLoadingRanges.ts` — new narrower seed-sampling table, real values (NEW)** — done

  **Description:** New file, sibling to `globalAudioSeedRanges.ts`. `GLOBAL_AUDIO_LOADING_RANGES: Record<GlobalAudioSeedFieldKey, LoadingRange>` — one entry per key `GLOBAL_AUDIO_SEED_RANGES` now has (post-Task-3: no chorus, no reverb.dampening, includes limiter.threshold). Values are a **direct, mechanical transcription** of [docs/reference/GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md)'s "Loading Range" column — confirmed with the user effect-by-effect ahead of this plan, no longer a placeholder:

  | Field | Loading Range |
  |---|---|
  | `eq3.low` / `eq3.mid` / `eq3.high` | −6 to 6 |
  | `filterLPF.frequency` | 2000 to 20000 |
  | `filterLPF.Q` | 0.1 to 5 |
  | `filterHPF.frequency` | 20 to 500 |
  | `filterHPF.Q` | 0.1 to 5 |
  | `delay.delayTime` | 0.05 to 0.5 |
  | `delay.feedback` | 0 to 0.4 |
  | `delay.wet` | 0 to 0.3 |
  | `reverb.decay` | 0.5 to 4 |
  | `reverb.preDelay` | 0 to 0.1 |
  | `reverb.wet` | 0.1 to 0.4 |
  | `compressor.threshold` | −24 to −6 |
  | `compressor.ratio` | 1.5 to 4 |
  | `compressor.attack` | 0.003 to 0.05 |
  | `compressor.release` | 0.05 to 0.3 |
  | `compressor.knee` | 2 to 15 |
  | `limiter.threshold` | −3 to −1 |

  **Acceptance criteria:**
  - [x] `GLOBAL_AUDIO_LOADING_RANGES` has exactly the same key set as `GLOBAL_AUDIO_SEED_RANGES` — no more, no fewer, checked structurally (not by a hand-maintained duplicate list) so the two tables can't silently drift apart later.
  - [x] Every entry's value matches the table above (and therefore `GLOBAL_CHAIN_GRID.md`'s "Loading Range" column) exactly — not approximately, not "close enough."
  - [x] Every entry's `min >= ` its own `GLOBAL_AUDIO_SEED_RANGES` counterpart's `min`, and `max <= ` its counterpart's `max` (the subset invariant) — genuinely non-trivial now that these are real narrower numbers, not placeholders equal to the full range.
  - [x] File-level comment states these values are transcribed from `GLOBAL_CHAIN_GRID.md`, which is the source of truth if the two ever disagree.

  **Verification:**
  - [x] `npx vitest run src/data/globalAudioLoadingRanges.test.ts` — 4/4 passing.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/data/globalAudioLoadingRanges.ts`, `src/data/globalAudioLoadingRanges.test.ts`

  **Estimated scope:** S

### Checkpoint: Type & data foundations
- [x] `npm run build:types` — confirmed the expected error surface only (globalFx.ts, audioStore.ts+test, globalAudioSeed.ts+test, audioRigConfig.ts, AudioRigDrawer.tsx, AudioEngine.test.ts, lfoEngine.test.ts), every one already scoped to Tasks 5–11 — nothing unexpected.
- [x] `npx vitest run src/types/globalAudio.test.ts src/types/lfo.test.ts src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts src/data/lfoConfig.test.ts` — 39/39 passing.
- [ ] Review with human before proceeding.

---

### Phase 2: Engine — chain reorder & Limiter

- [x] **Task 5: `src/engine/audioEngine/globalFx.ts` — remove Chorus, add Limiter, `wireGlobalFxChain`, `getGlobalChainEntry`, drop dead `dampening`, explicit `maxDelay`**

  **Description:** The largest single task in this plan. Remove the `Tone.Chorus` node, `setGlobalChorus`, and its `setEffectBypass` case entirely. Add a `Tone.Limiter` node (`_globalLimiter`), `setGlobalLimiter(params: Partial<LimiterSettings>)` (same pattern as every other `setGlobal*` — `_fxParamCache` entry, guarded no-op if the node wasn't constructed), and a `setEffectBypass` case for `'limiter'` (neutralize via `threshold` pushed to `0` dB — effectively transparent — matching the Compressor bypass precedent of neutralizing via parameter rather than physically rerouting). Replace `buildGlobalFxChain`'s static one-shot connection logic with `wireGlobalFxChain(controlledDecay: boolean)`, disconnecting every node and reconnecting the full sequence for whichever topology:
  - Natural (`controlledDecay: false`, default): `_globalEQ → _globalLPF → _globalHPF → _globalDelay → _globalReverb → _globalCompressor → _globalLimiter → masterGain → Destination`
  - Controlled (`controlledDecay: true`): `_globalEQ → _globalLPF → _globalHPF → _globalCompressor → _globalDelay → _globalReverb → _globalLimiter → masterGain → Destination`

  `buildGlobalFxChain()` itself now just constructs every node (Compressor, EQ3, LPF, HPF, Delay, Reverb, Limiter, masterGain — no Chorus) and calls `wireGlobalFxChain(false)` once at the end for the default topology. Add `getGlobalChainEntry(): Tone.EQ3 | null` returning `_globalEQ` (first in both topologies) — replaces `getMasterCompressor`, whose only job was being "whatever robots' busses connect to."

  **Two correctness fixes riding along in this same file (see spec Overview):** (1) remove the `(_globalReverb as unknown as { dampening: number }).dampening = params.dampening` line from `setGlobalReverb` entirely, plus `_fxParamCache.reverb.dampening` — `Tone.Reverb` has no such property, this line has never done anything. (2) The `Tone.FeedbackDelay` construction (`new DelayCtor({ delayTime: ..., feedback: ..., wet: ... })`) gains an explicit `maxDelay: 1` — matching the implicit default it's silently relied on, but now stated with a comment noting it must stay `>= GLOBAL_AUDIO_SEED_RANGES['delay.delayTime'].max`.

  **Design decision, stated not deferred:** rename `_masterCompressor` → `_globalCompressor` in this same task (matching its siblings' naming — `_globalReverb`/`_globalDelay`/`_globalEQ`/`_globalLPF`/`_globalHPF`), since it's touching every line that references the compressor node anyway and a later separate rename-only task would just be diff noise on the same lines. `getMasterCompressor` is removed outright (not kept as a deprecated alias) — its one caller is updated in Task 6, in the same phase.

  **Acceptance criteria:**
  - [x] No `Tone.Chorus`, `setGlobalChorus`, or `'chorus'` bypass case remains.
  - [x] `_globalLimiter` constructed in `buildGlobalFxChain`; `setGlobalLimiter` updates both `_fxParamCache.limiter` and the live node's `threshold`, no-ops safely if the node wasn't constructed (headless/test env).
  - [x] `setEffectBypass('limiter', false)` sets `threshold` to `0`; `setEffectBypass('limiter', true)` restores the cached threshold — mirroring the compressor case's restore-from-cache pattern.
  - [x] `wireGlobalFxChain(false)` produces the exact Natural sequence above; `wireGlobalFxChain(true)` produces the exact Controlled sequence above — both terminating at `masterGain → Destination`.
  - [x] Calling `wireGlobalFxChain` a second time (simulating a toggle flip) correctly disconnects the prior topology before reconnecting the new one — no node ends up connected to two different next-nodes simultaneously.
  - [x] `getGlobalChainEntry()` returns `_globalEQ`; returns `null` before `buildGlobalFxChain()` has run (same headless-safety pattern `getGlobalModulationTarget` already uses).
  - [x] `getMasterCompressor` no longer exists as an export.
  - [x] `setGlobalReverb` no longer references `dampening` anywhere; `_fxParamCache.reverb` has no `dampening` key.
  - [x] The `Tone.FeedbackDelay` constructor call includes an explicit `maxDelay: 1`, with a comment stating the `>= delay.delayTime`'s max dependency.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/globalFx.test.ts` — **new file** (see Architecture Decisions). Mocked `Tone` (same mock shape `AudioEngine.test.ts` already uses, extended with a `Limiter` constructor mock, minus `Chorus`). 18/18 passing — asserts the literal `.connect()` call sequence for both topologies, the toggle-flip disconnect/reconnect behavior (incl. flipping back to Natural after Controlled), `setGlobalLimiter`'s cache+node update, the limiter bypass case, `getGlobalChainEntry()`'s pre/post-build behavior, `getMasterCompressor`/`setGlobalChorus` no longer exported, that `setGlobalReverb` never touches a `dampening` property on the mocked node, that the `Tone.FeedbackDelay` mock is constructed with `maxDelay: 1`, and `setGlobalBypass`'s updated EQ3-entry-based routing (a necessary follow-on change not spelled out line-by-line above: it referenced `_masterCompressor` and a `_globalChorus`-inclusive fallback chain, both gone — now disconnects/routes the chain entry (`_globalEQ`) directly to Destination on bypass, and calls `wireGlobalFxChain(_currentControlledDecay)` to restore the currently-selected topology on un-bypass, reusing Task 5's own rewiring function instead of duplicating "find the next node" logic).
  - [x] `npm run build:types` — this file (and its test) clean. Remaining errors are exactly the expected downstream surface in files this task doesn't touch: `AudioEngine.ts`/`AudioEngine.test.ts` (Task 6, `getMasterCompressor`/`setGlobalChorus` references), `lfoEngine.test.ts` (Task 7, `'chorus.delayTime'` fixtures), `audioStore.ts`/`audioStore.test.ts` (Task 9), `globalAudioSeed.ts`/`.test.ts` (Task 8), `audioRigConfig.ts` (Task 10), `AudioRigDrawer.tsx` (Task 11). One unrelated pre-existing error (`src/systems/interactionSystem.test.ts:199`, a `vi.mocked` type-narrowing issue with no connection to chorus/globalFx/limiter, present before this task) — out of scope, not touched. `npm run lint` clean on both changed files.
  - [x] `npx vitest run` (full suite): 6 failed files / 103 failed tests, all within the same expected-downstream set above (plus `TransportBar.test.tsx`, which exercises `AudioEngine.start()` transitively and fails at runtime on the now-missing `getMasterCompressor` export — the same Task 6 gap, not a new one). 703 passing elsewhere, including all 18 new `globalFx.test.ts` tests.

  **Dependencies:** Task 1.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts` (NEW)

  **Estimated scope:** L (the one task in this plan that's borderline for further splitting — kept as one task because Chorus-removal, Limiter-addition, and the rewiring function are all edits to the same tightly-coupled connection logic in one file; splitting them would mean each sub-task leaves the file in a non-compiling intermediate state)

- [x] **Task 6: `src/engine/AudioEngine.ts` — `reserveVoice()` uses `getGlobalChainEntry()`, re-exports updated**

  **Description:** `reserveVoice()`'s one call site (`~line 637`) switches from `getMasterCompressor()` to `getGlobalChainEntry()` — the per-robot bus now wires into whichever node is genuinely first (`EQ3`), not a hardcoded compressor reference. Update the `AudioEngine` object's re-exports: drop `setGlobalChorus`, add `setGlobalLimiter`. Update `setEffectBypass`'s effect-key union type: drop `'chorus'`, add `'limiter'`.

  **Correction found during implementation:** `AudioEngine.ts` re-exports `setEffectBypass` directly from `globalFx.ts`, which has always typed `effect` as a bare `string` (never a literal union at this layer — the `EffectKey` union that the tsc errors reference lives in `audioStore.ts`/`audioRigConfig.ts`, Tasks 9–10). There was no `'chorus'`/`'limiter'` union in `AudioEngine.ts` itself to update; the acceptance criterion below is satisfied structurally (limiter is a valid runtime key in `globalFx.ts`'s switch, chorus isn't) rather than via a type-level change in this file.

  **Acceptance criteria:**
  - [x] `reserveVoice()` connects each robot's bus into `getGlobalChainEntry()`'s return value, not any compressor-specific accessor.
  - [x] `AudioEngine.setGlobalChorus` no longer exists; `AudioEngine.setGlobalLimiter` exists and delegates to `globalFx.ts`'s `setGlobalLimiter`.
  - [x] `AudioEngine.setEffectBypass` accepts `'limiter'`, not `'chorus'` (see correction above re: where the type union actually lives).

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` — `reserveVoice — bus wiring` describe block added (new test, asserts `busFilter.connect` was called with `getGlobalChainEntry()`'s EQ3 node); `setGlobalChorus` describe block replaced with `setGlobalLimiter`; `setGlobalBypass`'s bypass=true test retargeted from the Compressor mock to the EQ3 mock; the two `'chorus.delayTime'` modulation-target references removed (target array trimmed to 8, the dedicated chorus.delayTime test deleted); Tone mock's `Chorus` replaced with `Limiter`, stale `dampening` mock field dropped. 72/77 passing — the 5 remaining failures are `globalAudioSeed.ts`'s pre-existing `defaults.chorus` crash (Task 8's territory, reached transitively through `AudioEngine.start()` → `syncGlobalAudioToCurrentPlanet`), confirmed present before this task's own edits, not introduced by it.
  - [x] `npm run build:types` clean for `AudioEngine.ts`/`AudioEngine.test.ts`/`globalFx.ts` (no longer appear in the error list at all). `npm run lint` clean on both files.

  **Dependencies:** Task 5.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

- [x] **Task 7: `src/engine/lfoEngine.ts` — audit for the 8-target `GlobalLfoTargetId`**

  **Description:** No chorus-specific branch exists in this file to remove (verified: `globalSeedRangeKey()` only special-cases the `'lpf.'`/`'hpf.'` prefixes, never chorus) — this task is an audit + test update, not a rewrite. Confirm `resolveLfoOutputRange`, `connectLfoTarget`, and `disconnectLfoTarget` all continue to behave correctly against the narrowed 8-member `GlobalLfoTargetId` type with no special-casing needed. `AUDIO_SYSTEM.md`'s documented divergence ("`getGlobalModulationTarget('chorus.delayTime')` always returns null") is not this file's concern to remove — that's `globalFx.ts`, already handled by Task 5 dropping the whole target; the doc-comment cleanup here is this file's own internal comments only, if any reference chorus specifically (a grep-and-check, not assumed).

  **Acceptance criteria:**
  - [x] `npx tsc --noEmit` on this file shows no chorus-shaped type errors once Task 2 has landed (confirming no chorus-specific logic silently existed here).
  - [x] Any internal comment referencing chorus/9-targets is corrected or removed. Found and fixed one: `connectLfoTarget`'s doc comment listed `chorus.delayTime` alongside `pulseWidth` as an example of a "no live Signal" target — trimmed to just `pulseWidth`.
  - [x] All 8 remaining `GlobalLfoTargetId`s still connect/disconnect/resolve correctly (no behavior regression for the targets that survive) — confirmed `globalSeedRangeKey`/`resolveLfoOutputRange` never special-cased chorus at all (only `'lpf.'`/`'hpf.'` prefixes), so no logic change was needed there, exactly as predicted.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` — 44/44 passing. No target-count assertion existed to update (counts are derived dynamically from the arrays, not hardcoded). One fixture (`'reflects a previously-set rate/depth/shape'`) used `'chorus.delayTime'` as its target literal — replaced with `'delay.delayTime'`.
  - [x] `npm run build:types`, `npm run lint` clean — zero references to `lfoEngine.ts`/`lfoEngine.test.ts` remain in either output.

  **Dependencies:** Task 2.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** XS

### Checkpoint: Engine
- [x] Automated checks — engine layer (`globalFx.ts`, `AudioEngine.ts`, `lfoEngine.ts` + their tests) is fully clean: 0 type errors, 0 lint errors, 0 test failures attributable to any of the three. `npm run lint` is clean repo-wide already. `npm run build:types`/`npm run build` are NOT clean repo-wide yet — by design, per this checkpoint's own "modulo Phase 3–5" caveat: 33 remaining errors, all `chorus`/`dampening` references in `audioStore.ts`/`.test.ts`, `globalAudioSeed.ts`/`.test.ts`, `audioRigConfig.ts`, `AudioRigDrawer.tsx` (Tasks 8–11's own files, untouched until their tasks land). `npx vitest run` (full suite): 39 failed / 767 passed across exactly 6 files (`TransportBar.test.tsx`, `AudioRigDrawer.test.tsx`, `audioRigConfig.test.ts`, `AudioEngine.test.ts`, `audioStore.test.ts`, `globalAudioSeed.test.ts`) — all traced to the same Task 8–11 `chorus`/`dampening` gap, none new or unexplained (down from 103 failed / 6 files before Task 6, confirming Tasks 5–7 net-fixed real failures rather than just moving them).
- [ ] `globalFx.test.ts`'s topology tests are read by a human, not just run — connection order is exactly the kind of bug that passes a sloppy test and breaks real audio.
- [ ] Review with human before proceeding.

---

### Phase 3: Seeding logic

- [x] **Task 8: `src/utils/globalAudioSeed.ts` — Limiter sampling, Delay-only 25% `enabled`, loading-range sampling**

  **Description:** Remove chorus's 5 `sampleField` calls and reverb's `dampening` sampling call; add `limiter: { enabled: true, threshold: sampleField(noiseMap, 'limiter.threshold') }`. Move `enabled` seeding here per spec §5: every effect except Delay gets `enabled: true` unconditionally (Compressor, EQ3, LPF, HPF, Reverb, Limiter); Delay gets `enabled: delayEnabledT >= 0.75` where `delayEnabledT = getSeededVal(noiseMap, 'globalAudio.delay.enabled', 0, 0, 1)` — same pattern as the shipped LFO `activeT >= 0.8` threshold, just a different field/probability. `sampleField()`'s internals switch from `scaleUnitValue(t, GLOBAL_AUDIO_SEED_RANGES[key])` to `scaleUnitValue(t, GLOBAL_AUDIO_LOADING_RANGES[key])` — the `t` draw itself is unchanged, only which range it's mapped into.

  **Acceptance criteria:**
  - [x] `generateGlobalAudioSettings` returns no `chorus` field and no `reverb.dampening`; returns a fully-populated `limiter`.
  - [x] `compressor.enabled`, `eq3.enabled`, `filterLPF.enabled`, `filterHPF.enabled`, `reverb.enabled`, `limiter.enabled` are `true` on every call, for every planet (deterministic, not seeded).
  - [x] `delay.enabled` is seeded via the `>= 0.75` threshold — a statistical spot-check across many differently-seeded planets shows roughly 1-in-4 come back `true`, not roughly all or none (same style as `audioRigConfig.test.ts`'s own `activeT` statistical test from V1).
  - [x] Every sampled numeric value falls within `GLOBAL_AUDIO_LOADING_RANGES[key]`, not just the wider `GLOBAL_AUDIO_SEED_RANGES[key]`.
  - [x] Determinism preserved: same `(planetId, planetName)` → identical output, including the `delay.enabled` roll.

  **Verification:**
  - [x] `npx vitest run src/utils/globalAudioSeed.test.ts` — 22/22 passing. Chorus assertions removed, limiter assertions added, per-effect `enabled` assertions added (non-delay effects always `true`; delay's statistical ~25% spot-check across 40 sampled planets, plus its own determinism check), loading-range-bounds assertions replacing the old seed-range-bounds ones for sampled values.
  - [x] `npm run build:types`, `npm run lint` clean for this file and its test — both fully absent from either output now. Full-repo `npx vitest run`: down to 6 failed / 804 passed across 4 files (`TransportBar.test.tsx`, `AudioRigDrawer.test.tsx`, `audioRigConfig.test.ts`, `AudioEngine.test.ts`) — `audioStore.test.ts` and `globalAudioSeed.test.ts` are now fully clean too, since the runtime crash source (`defaults.chorus.enabled` on now-`undefined` `defaults.chorus`) no longer exists; `audioStore.ts` itself still spreads a nonexistent `generated.chorus` and calls the removed `AudioEngine.setGlobalChorus` (Task 9's job — currently masked at runtime by `audioStore.test.ts`'s own AudioEngine mock still defining `setGlobalChorus`, and by `{...undefined}` not throwing in JS, only under `tsc`).

  **Dependencies:** Task 3, Task 4.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** M

### Checkpoint: Seeding
- [x] Automated checks — `npm run lint` clean repo-wide. `npm run build:types`/`npm run build`: 16 remaining errors, all `chorus`-shaped in `audioStore.ts`/`.test.ts`, `audioRigConfig.ts`, `AudioRigDrawer.tsx` (Tasks 9–11, untouched). `npx vitest run`: 6 failed / 804 passed across 4 files (`TransportBar.test.tsx`, `AudioRigDrawer.test.tsx`, `audioRigConfig.test.ts`, `AudioEngine.test.ts`) — every touched-so-far test file (`globalFx.test.ts`, `AudioEngine.test.ts`'s own new/updated tests, `lfoEngine.test.ts`, `globalAudioSeed.test.ts`) passes in full; `AudioEngine.test.ts`'s remaining 5 failures are the pre-existing Task 9 LFO-priming tests that route through `audioStore.ts`'s still-unfixed chorus spread.
- [ ] Review with human before proceeding.

---

### Phase 4: Store wiring

- [x] **Task 9: `src/stores/audioStore.ts` — drop chorus/add limiter from lookup maps, remove force-`enabled` override, `compressorBeforeDelay` state**

  **Description:** `GLOBAL_SETTER`, `BYPASS_KEY`, and `BYPASS_EFFECT_KEYS` drop their `chorus`/`'chorus'` entries and gain `limiter`/`'limiter'` ones. `regenerateGlobalAudioFromSeed`'s existing force-every-effect-`enabled`-true block (the whole `compressor: { ...generated.compressor, enabled: true }` construction, repeated per effect) is removed entirely — `generateGlobalAudioSettings`'s own output (Task 8) is now used as-is, `enabled` included, since seeding is where that decision now lives. Add `compressorBeforeDelay: boolean` to initial state (default `false`) and a `setCompressorBeforeDelay(value: boolean)` action — updates state and calls `globalFx.ts`'s `wireGlobalFxChain(value)` (imported the same dynamic-import way `regenerateGlobalLfoFromSeed`'s AudioEngine-adjacent calls already are, if a circular-import issue surfaces the same way it did in `AUDIO_RIG.md`'s Task 9 — check for it here rather than assume it won't recur, since this is the same `audioStore.ts` ↔ `engine/*` boundary that bit that task).

  **Correction found during implementation:** `EffectKey` was defined as `Exclude<keyof GlobalAudioSettings, 'globalBypass'>` — with Task 1's new top-level `compressorBeforeDelay: boolean` field, that would have silently pulled `'compressorBeforeDelay'` into `EffectKey` (and therefore into `GLOBAL_SETTER`/`BYPASS_KEY`, which have no sensible entry for it). Fixed to `Exclude<keyof GlobalAudioSettings, 'globalBypass' | 'compressorBeforeDelay'>`. Also: `regenerateGlobalAudioFromSeed`'s seed-time bypass-push loop previously called `setEffectBypass(effect, true)` unconditionally for all 7 effects — with `enabled` now genuinely seeded (Task 8), that would have force-unbypassed Delay even when its seed rolled `enabled: false`, directly contradicting the acceptance criterion below. Changed to push each effect's own `globalAudio[effectKey].enabled`, via `Object.entries(BYPASS_KEY)` (replacing the old flat `BYPASS_EFFECT_KEYS` iteration, which is now a plain type alias — the runtime array was dropped, it was never read as a value elsewhere and ESLint correctly flagged it once the loop stopped iterating it).

  **Second correction, found via the full suite run (not this file, but exposed by fixing it):** `AudioEngine.test.ts`'s own `FIXTURE_GLOBAL_LFO` (Task 6's file) still had a `'chorus.delayTime'` entry, cast through `as any` into `useAudioStore.setState(...)` — invisible to `tsc` because of the cast, so Task 6's own build:types/lint pass never caught it, and its test failures were previously masked entirely by `audioStore.ts`'s chorus crash (the whole describe block errored before reaching its real assertions). Fixing `audioStore.ts` here exposed it. Removed the fixture entry and its two dedicated assertions, fixed the stale "9 targets" test title to "8".

  **Acceptance criteria:**
  - [x] No `chorus`/`'chorus'` entry remains in any of the three lookup maps; `limiter`/`'limiter'` entries exist in all three.
  - [x] `regenerateGlobalAudioFromSeed` no longer overrides `enabled` — a planet whose seed produces `delay.enabled: false` keeps that value in `globalAudio.delay.enabled` after regeneration, not forced to `true`.
  - [x] `setCompressorBeforeDelay(true)` updates `globalAudio.compressorBeforeDelay` and calls `wireGlobalFxChain(true)`; `setCompressorBeforeDelay(false)` the reverse.
  - [x] Initial `globalAudio.compressorBeforeDelay` is `false` before any seed/action runs.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts` — 30/30 passing. Mocked `wireGlobalFxChain` directly from `../engine/audioEngine/globalFx` (a plain static import — confirmed no circular-import risk this time, since `globalFx.ts` has zero store-layer imports, unlike the `AudioEngine.ts`↔`audioStore.ts` boundary that bit V1's Task 9). The override-removal behavior is asserted via a 40-planet statistical spot-check (mirroring `globalAudioSeed.test.ts`'s own style) showing `delay.enabled` lands both `true` and `false` across samples, not pinned.
  - [x] `npm run build:types`, `npm run lint` clean for `audioStore.ts`/`.test.ts`. `AudioEngine.test.ts` fixed and re-verified too (77/77 passing) per the second correction above.
  - [x] Full suite: down to 2 failed files / 16 failed tests (`AudioRigDrawer.test.tsx`, `audioRigConfig.test.ts` — exactly Tasks 10–11's own remaining scope) / 823 passed. `AudioEngine.test.ts` and `TransportBar.test.tsx` are both fully clean now — their earlier failures were `audioStore.ts`'s transitive chorus crash and its own fixture leftover, both fixed above.

  **Dependencies:** Task 5, Task 6, Task 8.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** M

### Checkpoint: Store wiring
- [x] Automated checks — `npm run lint` clean repo-wide. `npm run build:types`/`npm run build`: 5 remaining errors, all `chorus`-shaped in `audioRigConfig.ts`/`AudioRigDrawer.tsx` (Task 10–11, untouched). `npx vitest run`: 2 failed files / 16 failed tests / 823 passed — exactly `audioRigConfig.test.ts` and `AudioRigDrawer.test.tsx`, Tasks 10–11's own scope. Every engine/seeding/store test file (`globalFx.test.ts`, `AudioEngine.test.ts`, `lfoEngine.test.ts`, `globalAudioSeed.test.ts`, `audioStore.test.ts`) passes in full.
- [ ] Review with human before proceeding.

---

### Phase 5: UI

- [x] **Task 10: `src/data/audioRigConfig.ts` — drop chorus block, add limiter block, reorder, Decay toggle schemas**

  **Description:** Remove the `chorus` entry from `AUDIO_RIG_CONFIG` entirely (block + its 5 params). Remove `reverb`'s `dampening` param (dead — see Task 1/5/8; reverb keeps `decay`/`preDelay`/`wet`). Add a `limiter` block: one param (`threshold`, `sliderLinear`, dB — reuse whatever range Task 3 assigned `limiter.threshold`, with a lore/human label pair following this file's existing per-param labeling convention; no `lfoTarget`/`lfoAccordion` on it — Limiter never gets one). Reorder `AUDIO_RIG_CONFIG`'s array to match the new chain order: `eq3, filterLPF, filterHPF, delay, reverb, compressor, limiter` (was `compressor, eq3, filterLPF, filterHPF, chorus, delay, reverb`). Add `NATURAL_DECAY_SCHEMA`/`CONTROLLED_DECAY_SCHEMA` (both `ToggleSchema`, `id: 'audioRig.compressorBeforeDelay'`, `humanLabel` "Natural Decay"/"Controlled Decay" respectively) as new exports alongside `AUDIO_RIG_CONFIG` — chain-level, not nested inside any one effect block.

  **Acceptance criteria:**
  - [x] No `chorus` block remains; a `limiter` block exists with exactly one param, no LFO target.
  - [x] `reverb`'s block has exactly 3 params (`decay`, `preDelay`, `wet`) — no `dampening`.
  - [x] `AUDIO_RIG_CONFIG`'s block order is `eq3, filterLPF, filterHPF, delay, reverb, compressor, limiter`.
  - [x] `NATURAL_DECAY_SCHEMA`/`CONTROLLED_DECAY_SCHEMA` exported, same `id`, distinct `humanLabel`s, both `type: 'toggle'`.

  **Verification:**
  - [x] `npx vitest run src/data/audioRigConfig.test.ts` — 34/34 passing. Chorus describe block removed; reverb's param-count assertion updated to 3 (no dampening); new Limiter describe block (single `threshold` param, `TERMINAL CEILING GATE`/`OUTPUT CEILING` labels straight from the grid, no `lfoTarget`/`lfoAccordion`); block-order assertion updated; new `NATURAL_DECAY_SCHEMA`/`CONTROLLED_DECAY_SCHEMA` describe block.
  - [x] `npm run build:types`, `npm run lint` clean — and notably, `build:types` is now clean **repo-wide** (0 errors anywhere), one task early: `AudioRigDrawer.tsx`'s chorus-shaped errors were purely downstream of `AudioRigEffectKey`/`AUDIO_RIG_CONFIG`'s stale shape, not anything hardcoded in the drawer itself — exactly as Task 11's own description predicted. Full suite: down to 1 failed file / 8 failed tests (`AudioRigDrawer.test.tsx`, Task 11's own scope) / 829 passed.

  **Dependencies:** Task 1.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** M

- [x] **Task 11: `AudioRigDrawer.tsx` — drop chorus accordion, add limiter accordion, Decay toggle row**

  **Description:** With `AUDIO_RIG_CONFIG` already reordered (Task 10), the drawer's existing `.map()` over the config array naturally renders the new order and drops chorus / adds limiter without needing its own reordering logic — verify this is actually true (no hardcoded chorus-specific branch exists in the drawer today to also remove; confirm via a direct read, not assumed, since `renderParamControl`'s dispatcher is schema-driven and shouldn't need any chorus-specific code, but the removed 5th-param edge case is worth a specific look). The same schema-driven reasoning means reverb's dead `dampening` slider disappears automatically once Task 10's config no longer lists it — no drawer-specific change needed for that, just confirm it's actually gone. Add the Decay toggle row (master-row area, alongside the existing rig-wide Bypass toggle) — `<Toggle schema={globalAudio.compressorBeforeDelay ? CONTROLLED_DECAY_SCHEMA : NATURAL_DECAY_SCHEMA} value={globalAudio.compressorBeforeDelay} onChange={setCompressorBeforeDelay} />`.

  **Confirmed, as predicted:** direct read of `AudioRigDrawer.tsx` showed no chorus-specific or dampening-specific branch anywhere — `renderParamControl`'s dispatcher and the whole component are purely schema-driven off `AUDIO_RIG_CONFIG`. Task 10 alone made Chorus disappear, Limiter appear, dampening disappear, and the block order update, all with zero drawer changes (verified via the full test suite immediately after Task 10 landed — `AudioRigDrawer.tsx` itself type-checked clean before this task touched it at all). The only real functional gap was the Decay toggle, exactly as scoped.

  **Acceptance criteria:**
  - [x] No Chorus accordion renders; a Limiter accordion renders with exactly its one param, no nested LFO accordion.
  - [x] Reverb's accordion renders exactly 3 params — no dampening slider.
  - [x] Accordion render order matches the new chain order.
  - [x] The Decay toggle renders, defaults to showing "Natural Decay" (given `compressorBeforeDelay: false`), and clicking it calls `setCompressorBeforeDelay(true)`.
  - [x] After the store's `compressorBeforeDelay` becomes `true`, the same toggle's visible label reads "Controlled Decay" (re-render picks up the schema swap).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` — 21/21 passing. Chorus-accordion-absence assertion added; every existing "Threshold" slider query updated to `getAllByRole(...)[0]`/`[1]` (Compressor and Limiter now share the humanLabel "Threshold" by design, per the grid — Compressor's accordion renders first in the new chain order); Limiter-accordion assertions (single param, no nested LFO accordion); Reverb-no-dampening assertion; Decay-toggle render+label-swap+click-calls-action assertions; LFO-accordion count updated 9→8, non-flagged-param count 15→11.
  - [x] `npm run build:types`, `npm run lint` clean. Full suite: **65/65 files, 843/843 tests passing** — the entire V2 feature is green end to end. `npm run build` succeeds too (the one warning is the pre-existing V1 dynamic-import chunking note, not new).
  - [x] Minor CSS follow-through: `.audio-rig-drawer__master-row` gained `align-items: center` and `gap: 16px` — it previously held one toggle only; adding the Decay toggle alongside Bypass left them touching with no spacing.

  **Dependencies:** Task 9, Task 10.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** M

### Checkpoint: UI
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean — confirmed genuinely, not just "no new errors": 0 type errors repo-wide, 0 lint errors repo-wide, 65/65 test files and 843/843 tests passing, production build succeeds. This is the first point the whole feature compiles and renders end to end.
- [ ] Manual/audible check, deferred to a human (same pattern as V1): power on, confirm Chorus is genuinely gone from the console, Limiter's accordion works and is audibly transparent at default, and toggling Natural/Controlled Decay is audibly distinct.
- [ ] Review with human before proceeding.

---

### Phase 6: Docs

- [x] **Task 12: `docs/AUDIO_SYSTEM.md` — Signal Graph, API listing, LFO Modulation, Seeding**

  **Description:** Four sections need updating in this one file: Signal Graph (the new chain order, both topologies, and what the Decay toggle does structurally), the `AudioEngine` API code-block listing (`setGlobalLimiter` added, `setGlobalChorus` removed, `setEffectBypass`'s documented union updated), LFO Modulation (8 targets not 9; remove the now-moot "`chorus.delayTime` always returns null" divergence note — that whole caveat stops applying once chorus doesn't exist, not just the one case), and Seeding (rewrite the `enabled`-forced-true note — it's no longer forced, each effect seeds for real per Task 8's rule).

  **Acceptance criteria:**
  - [x] No remaining mention of Chorus anywhere in this file except as historical context if genuinely useful — kept exactly one: a note in the "Two Tone.js divergences" section explaining why the list only has 2 items now, explicitly framed as "no longer applies."
  - [x] Signal Graph section shows the new order and both named topologies.
  - [x] LFO target count is 8 everywhere it's stated (21 total, 13+8); the chorus.delayTime divergence note is gone.
  - [x] Seeding section accurately describes the new per-effect `enabled` behavior (all-true-except-Delay's-25%).

  **Verification:**
  - [x] Manual review — every claim spot-checked against the shipped source: `wireGlobalFxChain`/`getGlobalChainEntry` signatures (globalFx.ts), `setCompressorBeforeDelay` (audioStore.ts), `DELAY_ENABLED_THRESHOLD`/dataId `globalAudio.delay.enabled` (globalAudioSeed.ts), `GLOBAL_AUDIO_LOADING_RANGES` vs `GLOBAL_AUDIO_SEED_RANGES`'s split roles, the 8/13/21 target counts. Also fixed one stale reference the task didn't explicitly name but the same read surfaced: the Layered/Composite Voices section's "→ master compressor" phrase (now "→ global chain entry, EQ3").

  **Dependencies:** Task 11.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** S (docs only, but 4 sections)

- [x] **Task 13: `docs/reference/GLOBAL_CHAIN_GRID.md` — remove Chorus rows and the dampening row, add Limiter row**

  **Already done, no changes needed:** this file was rewritten earlier in this session, before implementation began, per the user's explicit instruction to make it the source of truth first ("we'll need to remove the chorus info from the grid, add the limiter, and please review the values to ensure they're appropriate with tonejs... interview me about each effect and we'll set the loading min max values"). This task's real remaining content is the verification pass, run now against the actually-shipped code rather than assumed from that earlier work.

  **Acceptance criteria:**
  - [x] No Chorus rows or `reverb.dampening` row remain; a Limiter row exists, consistent in shape with the other rows.
  - [x] Reverb has exactly 3 rows (`decay`, `preDelay`, `wet`).
  - [x] The new chain order and the Natural/Controlled Decay distinction are documented somewhere in this file, not just implied by row order — two header notes above the table (lines 3, 5).

  **Verification:**
  - [x] Manual review against `audioRigConfig.ts`'s shipped labels/ranges (Task 10) — row by row, every Effect/Param/Unit-Range/Effect Label/Param Label/UI-type/LFO-flag cell checked against the actual shipped `AUDIO_RIG_CONFIG` block, not approximately: all 19 rows match exactly, including the 8 `LFO?: X` flags matching `GlobalLfoTargetId`'s 8 members precisely. Also cross-checked every "Default" cell against `DEFAULT_GLOBAL_AUDIO_SETTINGS` (Task 1) — all match.

  **Dependencies:** Task 11.

  **Files:** `docs/reference/GLOBAL_CHAIN_GRID.md`

  **Estimated scope:** S

- [x] **Task 14: `docs/todo/roadmap.md` + `docs/SESSION_STORAGE.md` — remaining living-reference touch-ups**

  **Description:** `roadmap.md`'s Phase 4 "About" text (already rewritten once, by V1's own Task 13) needs another pass — its effect list/count and any behavior description are stale again post-V2. `SESSION_STORAGE.md`'s one-line "what's persisted" bullet lists `Chorus` among the global effects — swap it for `Limiter` (or the current 7-effect list generally), a one-line fix, low priority but bundled here since it's the same class of trivial drift.

  **Acceptance criteria:**
  - [x] `roadmap.md`'s Phase 4 text lists the current 7 effects (no Chorus, includes Limiter) and doesn't misdescribe the chain order/seeding behavior.
  - [x] `SESSION_STORAGE.md`'s effect list no longer names Chorus.

  **Verification:**
  - [x] Manual review against what actually shipped (Tasks 1–11), not the original spec's plan — same standard V1's own Task 13 used. `roadmap.md`'s Phase 4 About paragraph rewritten: 7 effects listed in signal-chain order (Chorus mentioned once, explicitly as historical "was cut" context), the Decay toggle and its dynamic label described, LFO target count 9→8 with a note that Limiter never gets one, and the seeded-`enabled` behavior (all true except Delay's ~25%) replacing the old "wires it through" framing that never mentioned enabled at all. `SESSION_STORAGE.md`'s one effect-list bullet: `Chorus` → `Limiter`.

  **Dependencies:** Task 11.

  **Files:** `docs/todo/roadmap.md`, `docs/SESSION_STORAGE.md`

  **Estimated scope:** XS

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean — 0 errors, repo-wide. `npm test` (`npx vitest run`): 65/65 files, 843/843 tests passing (re-run twice to confirm after one transient CPU-contention flake in a single run, not reproducible on the immediate re-run — no code changed between runs).
- [x] All acceptance criteria across all 14 tasks met, except the manual/audible check below (deferred to a human, same as V1's own pattern).
- [ ] Manual/audible check (Phase 5 checkpoint) confirmed by a human — deferred, not something this session can verify.
- [x] Every living-reference doc (`AUDIO_SYSTEM.md`, `GLOBAL_CHAIN_GRID.md`, `roadmap.md`, `SESSION_STORAGE.md`) spot-checked against shipped source, not reconstructed from memory — each task's own Verification section above records what was checked.
- [ ] Ready for human review / merge consideration alongside V1's already-shipped work on the same branch — pending the manual/audible check and human sign-off above.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `wireGlobalFxChain`'s disconnect/reconnect logic has a subtle bug (e.g. a stale connection left from the prior topology) | High — silent audio routing bug, not a compile error, easy to miss without dedicated tests | Task 5's new `globalFx.test.ts` asserts the literal connect-call sequence for both topologies and the toggle-flip transition specifically, not just "does audio play" |
| Removing `regenerateGlobalAudioFromSeed`'s force-`enabled`-true override (Task 9) silently regresses if the removal is incomplete (e.g. one effect's override line missed) | Medium — would silently keep forcing one effect on, defeating the whole point of Task 8's seeding work | Task 9's acceptance criteria explicitly require testing the case where a seed produces `delay.enabled: false` and asserting it survives unchanged — not just testing that the code compiles |
| `audioStore.ts`'s circular-import fragility (hit once already in V1's Task 9, `AudioEngine.ts` ↔ `audioStore.ts`) recurs for the new `wireGlobalFxChain` call from `setCompressorBeforeDelay` | Medium — same class of bug, now understood and has a known fix pattern (dynamic import) | Task 9 explicitly calls this out rather than assuming it won't recur; if it does, the same dynamic-import fix V1 used is the known-good pattern to reach for first |
| `globalFx.test.ts` (new file) duplicates rather than complements `AudioEngine.test.ts`'s existing chain-construction coverage, or the two drift out of sync | Low | Architecture Decisions states the split explicitly: `globalFx.test.ts` owns topology-connection-order correctness, `AudioEngine.test.ts` keeps its existing broader "does `start()` still work" integration coverage — not the same concern twice |
| `globalAudioLoadingRanges.ts`'s hand-transcribed values (Task 4) drift from `GLOBAL_CHAIN_GRID.md`'s "Loading Range" column if one is edited without the other | Low–Medium | Task 4's own acceptance criteria requires a value-correctness test asserting every entry against the grid's table, not just structural coverage — a drift shows up as a failing test, not silently |
| `reverb.dampening`'s removal is incomplete — one of its 6+ touch points (type, seed range, loading range, seeding, engine cast, UI slider, grid row) gets missed, leaving a dangling reference or a silently-reintroduced dead field | Low–Medium — mostly a compile error (caught immediately) except the engine-side dead cast, which is silent by nature (that's the whole reason it went unnoticed since Phase 0) | Every task touching a `reverb`-adjacent file (1, 3, 5, 8, 10, 13) has an explicit "no dampening" acceptance criterion, not just an implicit assumption it's handled elsewhere |
| `maxDelay: 1` is set but nothing ever re-checks it stays `>= delay.delayTime`'s max if that range is edited later | Low | Task 5's acceptance criteria requires the comment stating the dependency explicitly, so a future editor of either value has to consciously acknowledge the coupling — not a runtime check, but the plan doesn't claim one is needed for a value that isn't itself editable through the UI |

## Open Questions

None — both items in spec §7 (Controlled Decay's scope re: Reverb, the Decay toggle's dynamic-vs-static label) were confirmed by the user before this plan was written, and no new ambiguity surfaced while re-deriving the file-by-file task list above. The two correctness fixes found during the pre-implementation Tone.js verification pass (`reverb.dampening`, `Delay.maxDelay`) are resolved inline in their respective tasks, not carried as open items. The loading-range numeric values (Task 4) were also fully resolved before this plan's final revision — a real per-effect interview against `GLOBAL_CHAIN_GRID.md`'s full ranges, not left as a placeholder pass for later.
