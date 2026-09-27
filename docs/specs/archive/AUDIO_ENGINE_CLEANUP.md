# Spec: Audio Engine Cleanup (LFO teardown leak + duplication)

## Objective
A review of the Tone.js usage across `src/engine/` (AudioEngine, compositeVoice, globalFx,
lfoEngine, lfoDrift) surfaced one real, confirmed leak and several smaller duplication/
inefficiency findings. This spec fixes the leak (P0), the most concrete duplication (P1), and
bundles a handful of small, independent, opportunistic cleanups (P2) that don't warrant their
own spec. Nothing here changes audible behavior — every fix is teardown/dedup/hoisting, not a
change to what gets played or how it sounds, with one exception (§P2.4) that's flagged for a
decision rather than assumed.

## P0 — Robot LFO/drift state is never torn down on despawn

### The bug, verified directly against source
`AudioEngine.releaseVoice(robotId)` ([AudioEngine.ts:712](../../src/engine/AudioEngine.ts#L712))
disposes the composite voice's panner/busGain/busFilter, but has no knowledge of `lfoEngine` at
all. Two real call sites tear a robot down permanently and call `releaseVoice` today —
`localeStore.ts`'s `removeRobot` ([localeStore.ts:205-225](../../src/stores/localeStore.ts#L205-L225))
and `removeLocale` ([localeStore.ts:112-131](../../src/stores/localeStore.ts#L112-L131)) — and
neither calls anything in `lfoEngine.ts` either.

`lfoEngine.ts`'s own `disconnectLfoTarget` ([lfoEngine.ts:380-393](../../src/engine/lfoEngine.ts#L380-L393))
only calls `.disconnect()` on the live `Tone.LFO` — by design, since it's also called reversibly
whenever a user drags an LFO's rate to 0 (`robotOptionsActions.ts:155`, `audioStore.ts:236`) and
must leave the node alive and its settings intact for a later reconnect. It never removes the
`activeLfos`/`settingsByKey`/`connectedSignals` map entries for that key, and never disposes the
node. `lfoDrift.ts`'s `detachDrift` ([lfoDrift.ts:230-244](../../src/engine/lfoDrift.ts#L230-L244))
does properly `driftLinks.delete(key)`, dropping its two `Tone.Gain` nodes' only reference (fine
for GC), but never calls `.dispose()` on them (a lesser gap — see §P2.5).

**Net effect:** a robot that ever had an LFO connected and is then permanently removed
(`removeRobot`/`removeLocale`) leaves its `Tone.LFO` node — and the dead `activeLfos`/
`settingsByKey` map entries pointing to it — alive forever. Over a session with several
locale/robot removals, this grows unbounded. This is separate from (and does not touch) the
power-cycle "release-then-reserve" path in `spawnSystem.ts`'s `reRegisterAllRobotsAudio`
([spawnSystem.ts:656-670](../../src/systems/spawnSystem.ts#L656-L670)), which also calls
`releaseVoice` but immediately re-reserves the same robot — that path is intentionally
out of scope (see Non-goals).

### Fix
Add a new function to `lfoEngine.ts`'s public surface, `disposeRobotLfos(robotId: string): void`,
that fully tears down every robot-scoped LFO/drift instance for one robot — the "this robot is
gone forever" version of `disconnectLfoTarget`, not a replacement for it:

```ts
function disposeRobotLfos(robotId: string): void {
  for (const target of ROBOT_LFO_TARGET_IDS) {
    const key = instanceKey(target, robotId);
    disconnectLfoTarget(target, robotId); // reuses existing drift-detach + phase-fallback-cancel + connectedSignals cleanup
    const lfo = activeLfos.get(key);
    if (lfo) {
      try {
        lfo.dispose();
      } catch (err) {
        devWarn('[lfoEngine] disposeRobotLfos: dispose failed', err);
      }
      activeLfos.delete(key);
    }
    settingsByKey.delete(key);
  }
}
```

Export it from the `lfoEngine` object ([lfoEngine.ts:395-404](../../src/engine/lfoEngine.ts#L395-L404)).
Call it from both real-teardown sites in `localeStore.ts`, immediately alongside the existing
`AudioEngine.releaseVoice`/`AudioEngine.unregisterRobotMelody` try/catch pairs (same
independently-try/caught-per-call pattern already used there):

- `removeRobot` (localeStore.ts:205-225): add a third try/catch calling
  `lfoEngine.disposeRobotLfos(robotId)`.
- `removeLocale` (localeStore.ts:112-131): inside the existing `for (const robot of
  existing.robots)` loop, add a third try/catch calling `lfoEngine.disposeRobotLfos(robot.id)`.

`localeStore.ts` does not currently import `lfoEngine` — add `import { lfoEngine } from
'../engine/lfoEngine';`. No circularity risk: `lfoEngine.ts` doesn't import any store, and
`localeStore.ts` already imports `AudioEngine` directly the same way.

### Also fix alongside this (small, same-file, same-concern)
`lfoDrift.ts`'s `detachDrift` should call `.dispose()` on `rateDriftGain`/`depthDriftGain` before
dropping the link, not just `.disconnect()` — cheap, and matches Tone.js's own recommended
teardown (`.dispose()` releases the node's internal Tone-side bookkeeping immediately rather than
waiting on GC). Two-line addition inside the existing try/catch blocks at
[lfoDrift.ts:233-242](../../src/engine/lfoDrift.ts#L233-L242).

### Non-goals for P0
- Do **not** touch `AudioEngine.releaseVoice` itself, and do **not** add any LFO
  connect/disconnect call to `spawnSystem.ts`'s `reRegisterAllRobotsAudio`. That function calls
  `releaseVoice` then immediately `reserveVoice` for every robot on every power cycle — folding
  LFO teardown into `releaseVoice` itself would silently kill every robot's LFO modulation on
  every power-on, since nothing currently re-primes/reconnects LFOs after that path's
  `reserveVoice` call. Whether LFOs currently survive a power cycle correctly at all is a
  pre-existing, separate question this spec does not investigate or change.
- Do not change `disconnectLfoTarget`'s existing (correct) reversible behavior.

## P1 — compositeVoice.ts field-setter duplication

`applyLayersContinuous` (the live-update path called from `updateVoiceLayerParams`) repeats the
same 3-level fallback chain — try `synth.set({oscillator: {...}})`, on failure try writing
`.value` on a Signal-shaped field, on failure fall back to a raw property assignment — three
times almost verbatim, for `detune` ([compositeVoice.ts:197-204](../../src/engine/audioEngine/compositeVoice.ts#L197-L204)),
`phase` ([compositeVoice.ts:205-225](../../src/engine/audioEngine/compositeVoice.ts#L205-L225)),
and `pulseWidth`/width ([compositeVoice.ts:226-247](../../src/engine/audioEngine/compositeVoice.ts#L226-L247)).
A construction-time version of the same detune/phase logic exists separately too
(`createCompositeVoice`, same file, ~lines 106-151 — read exact range before editing).

**Fix:** extract one shared helper, e.g.:

```ts
function applyOscField(
  synth: SynthWithOscillator,
  setProp: string,             // 'detune' | 'phase' | 'width'
  fieldName: string,           // matching Tone.js .set() property name, if different from setProp
  value: number,
): void
```

that encapsulates the try-`.set()`-then-try-`.value`-then-try-raw-assignment chain once, and use
it from both the construction-time and live-update code paths. Exact signature is an
implementation detail for whoever picks this up — the acceptance bar is "the 3-level fallback
logic exists in exactly one place," not a specific function shape.

## P2 — small opportunistic cleanups (independent, low-risk, do in any order)

1. **Stub-node duplication in `AudioEngine.reserveVoice`.** The panner/busGain/busFilter stub
   fallback (used when a Tone ctor is missing, or in the catch-all failure path) is written out
   as a near-identical inline object literal twice — once per-node at
   [AudioEngine.ts:654-656](../../src/engine/AudioEngine.ts#L654-L656) (the "ctor missing"
   fallback), once more in the catch block at
   [AudioEngine.ts:703-705](../../src/engine/AudioEngine.ts#L703-L705) (the "construction threw"
   fallback). Factor into one or two small helpers in `toneHelpers.ts` (e.g. `makeStubPanner()`,
   `makeStubGain()`, `makeStubFilter()`, or one generic `makeStubNode(extra?: object)`) reusing
   the existing `MinimalToneNode` type, and use it at both sites.
2. **Redundant per-note pan recompute.** `triggerWithCap` ([AudioEngine.ts:364-371](../../src/engine/AudioEngine.ts#L364-L371))
   recomputes and reassigns `panner.pan.value` on every triggered note, immediately duplicating
   work `updateAllPanners` ([AudioEngine.ts:278-292](../../src/engine/AudioEngine.ts#L278-L292))
   already does for every reserved robot on every 16th-note tick — strictly more frequent than
   any single robot's own note-trigger rate. Remove the recompute block in `triggerWithCap`;
   `updateAllPanners`'s tick-level update is sufficient resolution for a robot moving around the
   scene. Verify `AudioEngine.test.ts`'s panning-related tests still pass after removal — if any
   test specifically asserts pan is set synchronously within `triggerWithCap` itself, that test
   encodes the old behavior and should be re-pointed at `updateAllPanners` instead, not kept as
   the reason to keep the duplicate write.
3. **`NOTE_RE` recompiled per-call.** [AudioEngine.ts:356](../../src/engine/AudioEngine.ts#L356)
   declares `const NOTE_RE = /^[A-Ga-g][b#]{0,2}\d+$/;` inside `triggerWithCap`, which runs per
   note. Hoist to module scope (there are other precomputed module-level constants nearby to
   match, e.g. the `VELOCITY_ROLL_X`-style pattern already used elsewhere in this file).
4. **[Ask first, don't just change] Zipper-noise inconsistency in `globalFx.ts`.**
   `updateRobotMasterVolume` explicitly ramps its gain change to avoid audible clicks, but
   `setGlobalReverb`/`setGlobalDelay`/`setGlobalFilterLPF`/`setGlobalFilterHPF`/`setGlobalEQ`/
   `setGlobalCompressor`/`setGlobalLimiter` ([globalFx.ts:213-292](../../src/engine/audioEngine/globalFx.ts#L213-L292))
   all do direct `.value =` assignment on params driven by continuously-dragged UI sliders. This
   might be genuinely inaudible for these specific params (short, frequent slider updates rather
   than one big jump) or might not — this is a listening-test judgment call, not a mechanical
   fix, and changing audio architecture requires asking first per CLAUDE.md. **Do not change this
   without explicit confirmation** — raise it with the user with a quick before/after test if
   picked up, and only change the params where it's audibly better.

   **RESOLVED**: confirmed live by the user — a large LPF frequency jump produced an audible
   click. Fixed by ramping `frequency` on both `setGlobalFilterLPF` and `setGlobalFilterHPF`
   (same node type, same risk) via a new `rampOrSet` helper reusing `updateRobotMasterVolume`'s
   existing shape; every other param here stays a direct write, since only frequency was ever
   confirmed audible. See `docs/tasks/AUDIO_ENGINE_CLEANUP.md`'s P2.4 section for the full
   before/after account.
5. **Drift Gain disposal** — folded into P0 above (`detachDrift`), not a separate task.
6. **(Optional, skip if not worth the churn) Dangling `scheduleVoiceRelease` timer past
   `killAll()`.** [AudioEngine.ts:256-271](../../src/engine/AudioEngine.ts#L256-L271) uses
   `Tone.getContext().setTimeout` (deliberately, to track real elapsed time independent of live
   BPM changes — not a CLAUDE.md violation) to decrement `activeVoices` after a note's duration.
   `stop()`/`killAll()` reset `activeVoices = 0` unconditionally but never cancel any pending one
   of these timeouts, so a stale one can still fire afterward and decrement (already-reset)
   `activeVoices` — harmless today because of the `Math.max(0, ...)` clamp everywhere it's
   written, but worth tracking and clearing pending timeout handles in `stop()`/`killAll()` if
   someone's touching this function anyway. Low priority — do not go out of the way for this one.

## Tech stack
No change: TypeScript 5.9, Tone.js 15, Vitest.

## Commands
- Type-check: `npm run build:types`
- Test: `npm test`
- Lint: `npm run lint`

## Testing strategy
- P0 is the highest-value target for a new test: add a test to `lfoEngine.test.ts` (or a new
  `disposeRobotLfos`-focused describe block) asserting that after `connectLfoTarget` +
  `disposeRobotLfos` for a robot, `getLfoSettings` for that robot's targets falls back to
  `DEFAULT_LFO_SETTINGS` (proves `settingsByKey` was cleared) and that a subsequent
  `connectLfoTarget` call for the same robot/target constructs a genuinely new `Tone.LFO`
  (proves `activeLfos` was cleared, not silently reusing a disposed node — this is the
  regression this whole spec exists to prevent).
- Add a test to `localeStore.test.ts` alongside the existing `releaseVoice`-spy assertions in the
  `removeRobot`/`removeLocale` describe blocks, spying on `lfoEngine.disposeRobotLfos` the same
  way those tests already spy on `AudioEngine.releaseVoice`.
- P1/P2 are refactors preserving existing behavior — no new tests required; the bar is **every
  existing test in `compositeVoice.test.ts` and `AudioEngine.test.ts` continues to pass
  unmodified** (except the one pan-recompute test called out in P2.2, if it exists and encodes
  the old duplicate-write behavior specifically).
- Run the full suite (`npm test`) after each of P0/P1/P2 individually, not just once at the end —
  same incremental-implementation discipline as the useGSAP migration.

## Boundaries
- **Always:** run `npm run build:types`, `npm run lint`, and the relevant test file(s) after each
  task; run the full suite before calling any task done.
- **Ask first:** P2.4 (the ramp-vs-direct-value question) — do not change it unilaterally.
- **Never:** fold LFO teardown into `AudioEngine.releaseVoice` itself (see P0 Non-goals); change
  `disconnectLfoTarget`'s existing reversible (non-disposing) contract.

## Success criteria
- A robot that is fully removed (`removeRobot`/`removeLocale`) leaves no `activeLfos`/
  `settingsByKey` entries and no live `Tone.LFO`/drift-Gain nodes behind — verified by the new
  test in `lfoEngine.test.ts`.
- The power-cycle path (`reRegisterAllRobotsAudio`) is untouched and its existing tests still
  pass unmodified.
- `compositeVoice.ts`'s oscillator-field fallback logic exists in one place, used by both
  construction and live-update.
- `npm run build:types`, `npm run lint`, and `npm test` all pass.
- No audible behavior change anywhere except P2.4, which only changes if explicitly approved.

## Open questions
- P2.4 (ramp vs. direct value for global FX params) is a judgment call for whoever picks this up
  to raise with the user, not something to resolve in this spec.
- Whether robot-level LFOs actually survive `reRegisterAllRobotsAudio`'s release-then-reserve
  cycle correctly today is unknown and explicitly out of scope (see P0 Non-goals) — flagged here
  so it isn't lost, in case it's worth its own future investigation.
