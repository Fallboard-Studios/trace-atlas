# Spec: Composite Layer Writes — the voice remembers what it was told, and addresses layers by their robot index

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (one file: `npx vitest run src/engine/audioEngine/compositeVoice.test.ts`)
> - The measurement (§5.3): `npx vite build --minify false --outDir <scratch> --emptyOutDir && npx vite preview --outDir <scratch> --port <port>`,
>   once for the branch base and once for the branch head, then the T7 scratch harness
>   (`node <scratch>/profile-raw.mjs --url "http://localhost:<port>/trace-atlas/?seed=charlie&x=200&y=-30&s=1.q1YqTlOyMjTTUSpOAdK1AA" --profile --throttle 4`)
> - The audibility probe (§5.4, already run): `npx vite --port 5199 --strictPort` with `probe-40.html` at the repo root, then
>   `node <scratch>/probe40.mjs`

**Status:** spec written 2026-10-27 from the confirmed intent
[docs/intent/composite-layer-writes.md](../intent/composite-layer-writes.md). Backlog items
[40](../todo/archive/backlog-archive.md#40-audio-every-layer-write-re-applies-every-layers-phase) and
[41](../todo/archive/backlog-archive.md#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers), the first line of
plan.md's Stage 1, on one branch because their fixes are one mechanism. They stay backlog items and archive at merge.
Plan: [docs/tasks/COMPOSITE_LAYER_WRITES.md](../tasks/COMPOSITE_LAYER_WRITES.md).

§7 is resolved (Crawford, 2026-10-27, "happy with your recs"), each as proposed:

1. The action rebuilds: `updateVoiceLayerParams` returns `needsRebuild`, `applyLayersContinuous` calls
   `reReserveVoice` then `primeRobotLinks`.
2. `LayerLivePatch` loses `adsr` and `portamento`; `setShared` is their only path.
3. The reservation-time top-level write stays as it is, out of scope.
4. The probe stays in scratch; its table and recipe go into PERFORMANCE.md.
5. An LFO link on a never-built layer resolves `null` until the unmute rebuild re-primes it; no UI change.

Crawford's decisions (interview, 2026-10-27): mute stays live and an unmute of a never-built layer is the one case
that rebuilds, no muted layer gets a synth up front; the measurement is recorded, not gated; the equal-write skip
covers every field by exact equality, timed glides included, with no epsilon, and the envelope caller sends only the
envelope.

---

## 1. Overview & Claude Explanation

### 1.1 What is wrong today

The composite voice ([compositeVoice.ts](../../src/engine/audioEngine/compositeVoice.ts)) is built from the robot's
*audible* layers (`filterAudibleLayers` in [AudioEngine.ts](../../src/engine/AudioEngine.ts) drops `gain === 0`) and
keeps one record per built layer, `layerNodes[i] = { synth, gainNode, layer }`, where `layer` is the `OscillatorLayer`
it was built from. Its `set({ layers }, time)` matches patch `i` to `layerNodes[i]` and writes every field present:
gain and detune through `setOrGlide` ([voiceEntry.ts](../../src/engine/audioEngine/voiceEntry.ts)), phase and pulse
width through `applyOscFieldViaSet` → `synth.set({ oscillator: { phase | width } })`, portamento and the ADSR through
the synth. Nothing updates `layer` afterwards. Three symptoms follow.

1. **Every write re-applies every field.** `OscillatorLayer.gain`, `detune` and `phase` are required
   ([layeredAudio.ts](../../src/types/layeredAudio.ts)), and `AudioEngine.updateVoiceLayerParams` hands `set` the
   robot's whole `layers` array, so one slider step or one swell tick on one field writes gain, detune and phase (and
   pulse width where present) on every built layer. Since backlog 38 the untouched gain and detune **glide** again on
   each write (`rampTo`, about three times a point write); the untouched phase re-runs Tone's `type` setter on the
   sounding oscillator (a cache-hit `setPeriodicWave`, or a native `type` reassign at phase 0). T7 measured the phase
   part at 0.03 % of the idle window on the 37 build, and the glide part as most of the +0.37 points in the robot
   param writes and +0.27 in the envelope bucket between 37 and head
   ([PERFORMANCE.md](../PERFORMANCE.md#the-swell-ticks-main-thread-share-stock-37-and-37--38-task-7)). The re-apply
   is inaudible (§5.4): a cost, not a pop.
2. **An envelope or portamento edit restores build-time values.** `updateVoiceEnvelope` and `updateVoicePortamento`
   build their patch from `composite.layers` as `{ ...layer, adsr }` / `{ ...layer, portamento }`, so an ADSR drag, an
   ADSR swell tick (sixteen a measure) or a glide edit writes the build-time gain, detune, phase and pulse width back
   over every edit or swell made since. The store and sliders keep the new values; the engine is wrong until that
   layer is written again. An ADSR swell and a gain swell on one robot fight every tick.
3. **Layers are matched by position against a list with the muted ones removed.** On a robot built with layer 1 muted
   the nodes are `[layer 0, layer 2]`. `updateVoiceLayerParams` sends `[l0, l1, l2]`: l1's edit lands on layer 2's
   synth, l2's edit finds no node and is dropped, and unmuting layer 1 by hand (`applyLayersContinuous`, a live
   write, not a rebuild) raises layer 2's gain. `getRobotModulationTarget` resolves an LFO link's `layerN.gain` /
   `layerN.detune` the same way (`voice.layers?.[N]`), so a link on layer 2 of that robot modulates nothing and a
   link on layer 1 modulates layer 2.

### 1.2 What changes

The composite becomes the one place that knows what each layer's synth was last told, and knows which robot layer
each synth is.

- **Robot index on every record.** `reserveVoice` tells `createCompositeVoice` the robot index of each layer it
  builds; the record becomes `{ index, synth, gainNode, written }`. `set` routes patch `i` to the record whose
  `index === i`, never by position. `getRobotModulationTarget` resolves the same way. A new `layerAt(index)` on the
  composite is the one lookup all three use.
- **Records of the last-written target.** `written` holds, per built layer, the last value the composite wrote for
  `gain`, `detune`, `phase`, `pulseWidth`, `portamento` and the ADSR (field by field: `attack`, `decay`, `sustain`,
  `release`, `attackCurve`, `releaseCurve`). Construction seeds it from what construction wrote; every later write
  updates it, including `reserveVoice`'s reservation-time `set` (§3). It is the last **target**, never a value read
  back from the node: after backlog 38 a gain or detune is mid-glide for a tick after each write.
- **Exact equality skips the write.** A field whose incoming value `===` the record is not written, with or without a
  `time`: a glide to the target already in flight is a no-op worth skipping. The ADSR compares field by field and is
  written whole when any field differs. No epsilon. The swell writes a new float every tick on the field it swells, so
  that field always passes; the fields it is not swelling arrive byte-identical and are skipped.
- **The two robot-level fields get their own entry point.** `setShared({ adsr?, portamento? }, time?)` applies either
  to every built layer through the same record-and-skip rule. `updateVoiceEnvelope` and `updateVoicePortamento` call
  it and stop re-stamping layer fields. `LayerLivePatch` loses `adsr` and `portamento` (§7 Q2), so there is one way to
  write each field.
- **A patch that cannot be routed is reported.** `set` returns `{ unrouted: number[] }`: the robot indices of patches
  that asked for a non-zero gain on a layer with no synth. A patch for a layer with no synth that leaves its gain at
  0, or carries no gain, is routed trivially (nothing to do). `updateVoiceLayerParams` returns `true` when
  `unrouted` is non-empty.
- **Mute stays live; unmute of a never-built layer rebuilds.** `applyLayersContinuous`
  ([robotOptionsActions.ts](../../src/systems/robotOptionsActions.ts)) writes the store as today, calls
  `updateVoiceLayerParams`, and when it returns `true` does what `applyLayersStructural` does after its store write:
  `reReserveVoice` then `primeRobotLinks`. The rebuild reads the store, where the new gain already is, so the layer is
  built. Lowering a built layer to 0 keeps its synth at gain 0, so a later unmute of it is live. No muted layer gets a
  synth up front (the Audio Load Budget, [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md)).
- **Callers keep sending whole layers.** The swell tick (`writeRobotValue` in
  [audioSwells.ts](../../src/systems/audioSwells.ts)), `RobotScreen.handleLayerParamChange` and
  `useCompanyOptions.onLayerParamChange` are unchanged. The composite is where the knowledge lives, so every caller
  gets the saving.

### 1.3 What it buys

- Symptom 2 goes by construction: the envelope path no longer carries layer fields, and even a caller that did would
  find the records current.
- Symptom 3 goes for `set`, for the hand unmute, and for LFO links.
- Symptom 1 goes for every field a write did not change. What remains per swell tick is one glide on the swelled
  field (or one ADSR `synth.set` per built layer on an ADSR swell), and §5.3 records the drop.

---

## 2. Target File Structure

```text
src/
├── engine/
│   ├── audioEngine/
│   │   ├── compositeVoice.ts             # records carry index + written; layerAt; set routes by index, diffs, returns unrouted; setShared
│   │   ├── compositeVoice.test.ts        # RED: skip-equal (timed and untimed), records update, index routing, unrouted, setShared
│   │   └── voiceEntry.ts                 # unchanged (setOrGlide stays the glide leaf)
│   ├── AudioEngine.ts                    # filterAudibleLayers keeps indices; reserveVoice passes them; updateVoiceLayerParams returns needsRebuild;
│   │                                     #   updateVoiceEnvelope / updateVoicePortamento call setShared; getRobotModulationTarget uses layerAt
│   └── AudioEngine.test.ts               # RED: stale envelope, index mismatch, modulation target by index, needsRebuild; envelope/portamento cases follow setShared
├── systems/
│   ├── robotOptionsActions.ts            # applyLayersContinuous rebuilds on needsRebuild (shared helper with applyLayersStructural)
│   └── robotOptionsActions.test.ts       # RED: rebuild on unmute of a never-built layer, live on mute and on unmute of a built one
└── types/
    └── layeredAudio.ts                   # unchanged
docs/
├── AUDIO_SYSTEM.md                       # Layered / Composite Voices: records, index routing, the unmute rebuild, setShared
├── PERFORMANCE.md                        # §5.3's before/after beside T7, and §5.4's probe
└── todo/backlog.md, plan.md              # 40 and 41 Built lines; at merge both archive and the plan.md line goes
```

No new file under `src/`. No new dependency. The probe page and harness stay in scratch (recipe in §5.4).

---

## 3. Implementation Boundaries & Constraints

- **The record is written targets, nothing read back.** The composite never reads `.value` off a node to decide a
  write. Headless stubs have no live values to read, and a glide in flight would never compare equal.
- **Construction seeds the records and is never skipped.** The build writes every layer's `type`, `gain`, `detune`,
  `phase`, `pulseWidth`, the shared ADSR and portamento exactly as today, then records them. The skip applies to
  `set` and `setShared` only.
- **The reservation-time top-level write stays as it is.** `reserveVoice`'s `phase`, `detune` and `pulseWidth`
  parameters are applied through `set` right after the build. No writer sets `audioAttributes.phase` or `.detune`
  (only `Robot.ts` declares them, and every caller passes them through), so that branch runs only for `pulseWidth`,
  which every caller passes as `layers[0]?.pulseWidth`: when layer 0 is a pulse, its width is written to every built
  layer. That is pre-existing, is not a swell or edit path, and is out of scope (§7 Q3 offers its deletion); it goes
  through `set`, so the records follow it either way.
- **Index routing changes the contract of `set` only for voices with a muted layer.** For a voice built from all
  three layers the indices are the positions, and every existing call reads the same. `createCompositeVoice` called
  with a plain array and no indices keeps position = index, so tests that build a voice directly are unchanged
  unless they exercise the new behaviour.
- **`unrouted` is about gain only.** A patch for a never-built layer whose gain stays 0 (a detune drag on a muted
  layer, a swell that cannot start there because `isRobotAttributeStructurallyLive` already declines) is not a
  rebuild trigger. A non-zero gain is the only thing a missing synth cannot honour.
- **The rebuild is the action's, not the engine's.** `updateVoiceLayerParams` reports; `applyLayersContinuous`
  decides, because the re-prime of LFO links (`primeRobotLinks`) lives there and a rebuild without it leaves links on
  disposed nodes (the stale-signal fix, `applyLayersStructural`'s comment). §7 Q1.
- **The time rule of backlog 38 stands.** A live Param or Signal takes the `time` (gain, detune glide one tick);
  a setting does not (phase, pulse width, portamento, ADSR land now). The skip sits in front of that rule, it does not
  change it.
- **The swell tick does not change.** Not its pool, not its write shape, not `cancelSwellForRobotAttribute`.
- **No Tone construction outside the engine; state stays serialisable; nothing new is stored.** The records are
  runtime-only objects inside the composite, as the node references already are.
- **Not in scope:** the click a hand phase drag makes (Tone swaps the periodic wave on the sounding oscillator; each
  slider step is a 58–75 % full-scale step, §5.4 — noted, not acted on); the pre-scheduled swell curve; backlog 27;
  backlog 39.

---

## 4. Code Style & Architecture Conventions

```typescript
// src/engine/audioEngine/compositeVoice.ts — shape, not final code

/** What the composite last wrote to one layer's synth. Targets, never values read back from a node. */
interface WrittenLayer {
  gain: number;
  detune: number;
  phase: number;
  pulseWidth?: number;
  portamento: number;
  adsr: ADSREnvelope;
}

interface LayerRecord {
  /** The robot layer this synth was built from (the index into `audioAttributes.layers`). */
  index: number;
  synth: Tone.Synth;
  gainNode: Tone.Gain;
  written: WrittenLayer;
}

export type LayerLivePatch = Partial<Pick<OscillatorLayer, 'gain' | 'detune' | 'phase' | 'pulseWidth'>>;

export interface CompositeVoice {
  output: Tone.Gain;
  triggerAttackRelease: (...) => void;
  /** Patch `i` is for robot layer `i`. Returns the indices whose non-zero gain found no synth. */
  set: (params: { layers?: LayerLivePatch[]; outputGain?: number }, time?: number) => { unrouted: number[] };
  /** The two robot-level fields, applied to every built layer. */
  setShared: (params: { adsr?: ADSREnvelope; portamento?: number }, time?: number) => void;
  layerAt: (index: number) => LayerRecord | undefined;
  layers?: ReadonlyArray<LayerRecord>;
  dispose?: () => void;
}

// inside set, per field — the whole rule in one place
if (p.gain !== undefined && p.gain !== rec.written.gain) {
  setOrGlide(rec.gainNode.gain, p.gain, time);
  rec.written.gain = p.gain;
}
```

```typescript
// src/engine/AudioEngine.ts — shape, not final code
function filterAudibleLayers(layers: OscillatorLayer[]): { layers: OscillatorLayer[]; indices: number[] } { … }

updateVoiceLayerParams(robotId, layers, time?): boolean   // true = a non-zero gain had no synth; rebuild

// src/systems/robotOptionsActions.ts
export function applyLayersContinuous(robot, localeId, layers, time?): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { audioAttributes: { ...robot.audioAttributes, layers } });
  if (AudioEngine.updateVoiceLayerParams(robot.id, layers, ...timeArg(time))) rebuildVoice(robot);
}
```

- The record update sits beside the write, in the same `if`, so a write and its record cannot drift. Each field's
  branch is the same four lines; no generic field table, because the four write leaves differ (`setOrGlide`,
  `applyOscDetune`, `applyOscFieldViaSet`, `synth.set`).
- Doc comments say what the composite records and why in one sentence, with a pointer to this spec. They do not
  narrate the bug: no "used to", no "fixed in". The history is the backlog archive.
- `devWarn` from `src/utils/helpers` for any new failure path, never `console.*`.
- Tests are colocated and call the code they check; none reads source text (CLAUDE.md).

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; each one mutation-checked)

**Composite** (`compositeVoice.test.ts`, the existing mocked `Tone.Synth` / `Gain`):

1. **Equal writes are skipped.** Build `[sine gain 0.8 detune 0 phase 90]`, clear the mocks, `set({ layers: [{ gain:
   0.8, detune: 0, phase: 90 }] })`: no `gainNode.gain` write, no `oscillator.detune` write, no `synth.set`. Then
   `set` with `gain: 0.5`: exactly one gain write, still no `synth.set`. **Timed:** the same with a `time` and a
   `rampTo` stub: no `rampTo` for an equal value, one for a changed one. **RED today:** every call writes every
   field. **Mutant:** drop the equality guard on any one field.
2. **Records follow writes.** `set({ layers: [{ gain: 0.5 }] })` then `set({ layers: [{ gain: 0.5 }] })`: the second
   writes nothing. Then `setShared({ adsr })`: the synth gets `{ envelope }` and the gain node is not written. **RED
   today:** no `setShared`. **Mutant:** record the value before the write and skip the write.
3. **`setShared` diffs too.** The same `adsr` twice: one `synth.set({ envelope })` per built layer, not two. A one-field
   change (`release`) writes once more. `portamento` likewise on `synth.portamento`.
4. **Routing by index.** Build with `indices: [0, 2]`; `set({ layers: [{ gain: 0.1 }, { gain: 0.2 }, { gain: 0.3 }]
   })`: the first synth's gain gets 0.1, the second's gets 0.3, and nothing gets 0.2. `layerAt(1)` is `undefined`,
   `layerAt(2)` is the second record. **RED today:** position matching. **Mutant:** route by position.
5. **`unrouted`.** On that voice, `set` with `{ gain: 0.5 }` at index 1 returns `{ unrouted: [1] }`; with `{ gain: 0
   }` or `{ detune: 5 }` at index 1 returns `{ unrouted: [] }`; a full-voice `set` returns `[]`.
6. **Construction seeds the records and is not skipped.** Build with phase 90: `synth.set({ oscillator: { phase: 90 }
   })` is called once at construction (the existing construction cases stay), and a following `set` with phase 90
   does not call it again.
7. **Existing cases that send `adsr` or `portamento` through `set({ layers })`** move to `setShared`. The "same calls
   with a time as without" case (settings ignore the time) keeps its assertion through `setShared` for the two shared
   fields and `set` for phase and pulse width, with values that differ from the build so they are written.

**Engine** (`AudioEngine.test.ts`):

8. **The stale envelope patch** (symptom 2). Reserve `[l0, l1]`, `updateVoiceLayerParams` with l0 gain 0.3, clear,
   `updateVoiceEnvelope(adsr)`: every synth gets `{ envelope }` and no gain node is written. **RED today:** the gain
   node is written back to the build value. The same for `updateVoicePortamento`. The existing "hands a Transport
   time to composite.set with the patched layers" case changes to assert `setShared({ adsr }, 3.25)`.
9. **The index mismatch** (symptom 3). Reserve `[l0, l1 (gain 0), l2]`: the voice has two records with indices `[0,
   2]`. `updateVoiceLayerParams` with l2's detune changed writes the second synth's detune; with l1's detune changed
   writes nothing. **RED today:** l1's edit lands on the second synth, l2's is dropped.
10. **The modulation target by index.** On that voice `getRobotModulationTarget('layer2.gain')` is the second gain
    node's `gain`; `'layer1.gain'` is `null`. **RED today:** `'layer1.gain'` returns the second node and
    `'layer2.gain'` returns `null`.
11. **`needsRebuild`.** On that voice `updateVoiceLayerParams` with l1 gain 0.5 returns `true`; with l1 gain 0 returns
    `false`; with l0 gain 0 (muting a built layer) returns `false`; a full-voice call returns `false`; an unreserved
    robot returns `false` and does not throw.
12. **Node count unchanged** — the pinned baseline (`builds today node counts for a plain two-layer reservation`)
    passes as it is: no synth for a muted layer.

**Actions** (`robotOptionsActions.test.ts`, `AudioEngine` mocked as its neighbours do):

13. **Unmute of a never-built layer rebuilds.** `updateVoiceLayerParams` mocked to return `true`:
    `applyLayersContinuous` writes the store, then calls `reReserveVoice` and `primeRobotLinks` in that order. Mocked
    `false`: neither is called. **RED today:** `applyLayersContinuous` never rebuilds. **Mutant:** drop the
    `primeRobotLinks` call.

**Swells** (`audioSwells.test.ts`): the existing "a layer gain swell write reaches `updateVoiceLayerParams` with the
tick time last" case passes unchanged; no new case, the tick does not change.

Not tested, by CLAUDE.md's "no RED test for a task with no behaviour": the doc comments and docs, whose proof is a
read; `LayerLivePatch` losing two optional fields (the compiler finds the senders).

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm test` and `npm run build` all clean. Full suite at each checkpoint; types
and lint after each task. The suite is 331 files / ~12 285 tests; one known timeout (`sceneToOrbiterLocal`, passes
alone) is not this branch's.

### 5.3 The measurement (recorded, not gated)

T7's method ([PERFORMANCE.md](../PERFORMANCE.md#the-swell-ticks-main-thread-share-stock-37-and-37--38-task-7)), in
one session, two builds: the branch base (`main` at the branch point) and the branch head, each built unminified to its
own scratch `--outDir`, served on its own port, S1, 4× throttle, three runs each interleaved so no build runs twice in
a row, foreground, one run per call, orphaned Chrome 0 before and after. The scratch harness (`profile-raw.mjs` +
`analyze.mjs`, raw CPU profile plus long-task entries, `NavigationStart` from CDP `Performance.getMetrics`) is rebuilt
in scratch from T7's description, not committed.

Record beside T7, medians and min–max, the same buckets:

- `tickAudioSwells` inclusive, and with the store half excluded;
- envelope: `updateVoiceEnvelope`;
- robot param writes: `setOrGlide`, `applyOscDetune`;
- oscillator settings: `applyOscFieldViaSet`, of which Tone's `phase` setter;
- long tasks in the window and how many hold tick time.

**Expected:** the envelope bucket falls back toward 37's 0.22 % (head read 0.49 %); the robot param writes fall back
toward 37's 0.16 % (head 0.53 %) with only the swelled field's glide left; the phase setter under the tick reads ~0
(head 0.06 %). A miss is written up as a number and a reason, and the branch continues (Crawford, Q2).

### 5.4 The audibility probe (run 2026-10-27, recorded)

The question backlog 40 left open: whether re-applying an unchanged phase mid-note is audible. Answered before this
spec, recorded in PERFORMANCE.md by the docs task.

Headless Chrome (new headless), a native `AudioContext` at 48 kHz handed to `Tone.setContext`, one `Tone.Synth` at
250 Hz (a 192-sample period), attack 5 ms, sustain 1, an `AudioWorkletNode` recorder (blob-URL module) on the synth's
output; ten `synth.set({ oscillator: { phase } })` writes 100 ms apart from 0.5 s into the sustain — the app's call.
Metric: `|x[n] − x[n−192]|` over the settled sustain, ~0 on a steady note and large only at a discontinuity (a
max-sample-jump metric cannot work on a square). Peak ≈ 0.99.

| Case | Quiet max | Max in the ten write windows (−5…+30 ms) |
|---|---|---|
| square phase 90, no writes (baseline) | 1.35e-5 | — |
| square phase 0, re-apply 0 (native `type` reassign) | 1.52e-5 | 1.52e-5, all ten |
| square phase 90, re-apply 90 (cache hit, `setPeriodicWave`, same wave) | 1.35e-5 | 1.35e-5, all ten |
| sine phase 90, re-apply 90 | 3.9e-7 | 3.8e-7, all ten |
| pulse phase 90 width 0.3, re-apply 90 (inner triangle) | 0 | 0, all ten |
| square phase 90, drift 91→100 (positive control) | 1.67e-5 | 0.58–0.75 at every write |
| square phase 0, drift 1→10 (positive control) | 1.67e-5 | 0.58–0.75 at every write |

An identical re-apply is sample-exact with the steady note on both of Tone's paths; a real phase change is a
58–75 % full-scale step per write (the click a hand drag of phase makes, and the cost backlog 37 took off the swells).
Crawford's ear the same day agreed: a detune drag at phase 90 was clean, a phase drag on a square clicked.

Recipe notes, for whoever reruns it: `Tone.Offline` cannot test a setting write mid-note (its scheduled callbacks run
in a pre-pass before `startRendering`, so the last value wins); Tone 15's `rawContext` is a standardized-audio-context
wrapper, not a native `BaseAudioContext`, so the recorder needs a native context given to `Tone.setContext`; Vite's
first load of the page may re-optimise deps and reload it, so warm the server before driving it.

### 5.5 The listen (Crawford): Checkpoint

A few minutes on the desktop, one robot you can hear on its own, long Release:

- a gain drag, then an ADSR drag: the gain stays where you put it (symptom 2);
- a robot with one layer muted: a detune drag on each of the other two moves the right layer, and raising the muted
  layer's gain makes it sound after a short gap (symptom 3, the rebuild); lowering a built layer to 0 and back is
  live, no gap;
- a swell on a sustained note: nothing new to hear; §5.4 says the removed writes were never audible.

### 5.6 Done when

- [ ] §5.1 tests 1–13 pass, each mutation-checked; the existing cases in 7, 8 and 12 updated or passing as stated.
- [ ] A voice built from `[l0, l1 (gain 0), l2]` routes l2's edit to the second synth, drops l1's, and
      `getRobotModulationTarget('layer2.gain')` resolves it.
- [ ] An ADSR or portamento edit writes no layer field.
- [ ] Raising a never-built layer's gain rebuilds the voice and re-primes its links; muting a built one does not.
- [ ] §5.3 recorded in PERFORMANCE.md with both builds' numbers, and §5.4's table beside it.
- [ ] Crawford's listen passed (§5.5).
- [ ] AUDIO_SYSTEM.md's Layered / Composite Voices section describes the records, index routing, `setShared` and the
      unmute rebuild; its sentence that an unmute "only gets excluded from the graph on the next real rebuild" is
      replaced.
- [ ] Backlog 40 and 41 carry Built lines.
- [ ] Every check in §5.2 is clean.

---

## 6. Git & Workflow Context

- **Branch:** `fix/composite-layer-writes`, off `main` at `a5d5944d` (PR #588 merged). One PR closes 40 and 41.
- **Tasks:** in order, one commit each, RED first where there is behaviour. The plan fixes the exact list.
  1. Composite: records with `index` and `written`, `layerAt`, index routing (tests 4, 6).
  2. Composite: the equal-write skip on every field, timed and untimed (tests 1, 2).
  3. Composite: `setShared`, `LayerLivePatch` narrowed, existing `adsr`/`portamento` cases moved (tests 3, 7).
  4. Composite: `set` returns `unrouted` (test 5).
  5. Engine: `filterAudibleLayers` keeps indices, `reserveVoice` passes them, `getRobotModulationTarget` uses
     `layerAt` (tests 9, 10, 12).
  6. Engine: `updateVoiceEnvelope` / `updateVoicePortamento` through `setShared` (test 8).
  7. Engine: `updateVoiceLayerParams` returns `needsRebuild` (test 11).
  8. Actions: `applyLayersContinuous` rebuilds on `needsRebuild`, shared helper with `applyLayersStructural`
     (test 13).
  9. Checkpoint A: full suite, types, lint, build.
  10. The measurement (§5.3), recorded.
  11. Checkpoint B: Crawford's listen (§5.5).
  12. Docs: AUDIO_SYSTEM.md, PERFORMANCE.md (§5.3 and §5.4), the composite's and engine methods' doc comments.
  13. The backlog: Built lines on 40 and 41. At merge both go to the archive in the usual way and their plan.md line
      is deleted.
- **Type safety per commit:** each commit type-checks. Task 3's `LayerLivePatch` narrowing lands with its senders.
- **Commit messages:** short and imperative, naming the proof ("RED then green: …", "a read", "the run"). The PR is
  Crawford's.

---

## 7. Open Questions

1. **Who rebuilds on an unmute of a never-built layer?** Proposed (§1.2, §3): `updateVoiceLayerParams` returns
   `needsRebuild` and `applyLayersContinuous` does the rebuild and the link re-prime, because `primeRobotLinks` lives
   in the actions and a rebuild without it leaves LFO links on disposed nodes. Alternative: the engine calls
   `reReserveVoice` itself and the action re-primes on a returned flag — the same two calls, split across two files.
2. **`LayerLivePatch` loses `adsr` and `portamento`.** Proposed: yes, so `setShared` is the only path for the two
   robot-level fields and the layer patch carries only layer fields. Alternative: keep them optional on the patch and
   diff them there too; it leaves two ways to write the same field, which is how symptom 2 happened.
3. **The reservation-time top-level write** (`reserveVoice`'s `phase`, `detune`, `pulseWidth` parameters and the
   `set` right after the build). Proposed: left as it is, out of scope. For the record: no writer sets
   `audioAttributes.phase` or `.detune`, and every caller passes `layers[0]?.pulseWidth`, which copies layer 0's
   width to every built layer when layer 0 is a pulse. Deleting the branch and the three parameters would be a
   removal, which is Crawford's call; it would also delete the "applies composite phase/detune/width at reservation
   time" paths from four reservation call sites and their tests.
4. **Where the probe lives.** Proposed: §5.4's table and recipe go into PERFORMANCE.md by the docs task and the page
   and driver stay in scratch, as T7's harness did. Alternative: commit `probe40.mjs` under `scripts/perf/` as a
   reusable audibility probe; it would need the `probe-40.html` page served from somewhere other than the repo root.
5. **An LFO link on a never-built layer.** After this change `getRobotModulationTarget` returns `null` for it (today
   it returns a neighbour's node), so the link is not connected until the unmute rebuild re-primes it. Proposed: that
   is right and needs no UI change; the link is stored and comes live with the layer. Flagged in case the LFO Bank
   screen shows such a link as live.
