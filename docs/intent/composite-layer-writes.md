# Intent: Composite Layer Writes — the voice remembers what it was told, and addresses layers by their robot index

Confirmed via `interview-me` on 2026-10-27 (3 questions, every guess confirmed), ahead of a `spec-driven-development`
pass. Backlog items [40](../todo/archive/backlog-archive.md#40-audio-every-layer-write-re-applies-every-layers-phase) and
[41](../todo/archive/backlog-archive.md#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers), the first line of
plan.md's Stage 1, taken together on one branch because their fixes are one mechanism. Not a roadmap entry; two
bug-shaped items that stay in the backlog and archive at merge.

## Outcome

The composite voice ([compositeVoice.ts](../../src/engine/audioEngine/compositeVoice.ts)) becomes the one place that
knows what each layer's synth was last told. Today `set` writes whatever it is handed: `OscillatorLayer.gain`,
`detune` and `phase` are all required ([layeredAudio.ts](../../src/types/layeredAudio.ts)), and
`AudioEngine.updateVoiceLayerParams` ([AudioEngine.ts](../../src/engine/AudioEngine.ts)) passes the robot's whole
`layers` array, so every slider step and every swell tick re-applies every field of every layer — since backlog 38 the
untouched gain and detune re-**glide** (`setOrGlide`, about three times a point write) and the phase setter re-runs
Tone's `type` setter on the sounding oscillator. The composite's per-layer records (`layerNodes[i].layer`) are the
build-time values and `set` never updates them, so `updateVoiceEnvelope`, which builds its patch from those records,
writes build-time gain, detune, phase and pulse width back over every edit or swell made since. And `set` matches
patches to synths by position against a list that `filterAudibleLayers` built without the muted layers, so on a robot
whose layer 1 was muted at build an edit to layer 1 lands on layer 2's synth, an edit to layer 2 is dropped, and
unmuting layer 1 raises layer 2's gain.

After this: the composite keeps, per **robot layer index**, the last value it wrote for every field, writes to Tone
only when a value differs, finds each layer's synth by that robot index, and the envelope edit sends only the
envelope. The three symptoms go with one change, and the re-applied writes T7 measured
([PERFORMANCE.md](../PERFORMANCE.md#the-swell-ticks-main-thread-share-stock-37-and-37--38-task-7)) go with them.

## Behavior

- **Records of the last-written target, per field.** Each layer record holds the last value `set` wrote for gain,
  detune, phase, pulse width, portamento and the ADSR (field by field), seeded from the build. It is the last
  **target**, never the node's live value: after backlog 38 a gain or detune is mid-glide for a tick after each write
  and would never compare equal.
- **Exact equality, no epsilon.** A write whose value equals the record is skipped, timed or not — a glide to the
  target already in flight is a no-op worth skipping. The swell writes a new float every tick on the field it swells,
  so those always pass; the fields it is not swelling arrive byte-identical and are skipped. An epsilon is a tolerance
  nobody asked for. (Crawford, Q3.)
- **Layers addressed by robot index.** The composite records which robot layer each synth was built from and `set`
  matches a patch by that index, so a muted-at-build layer no longer shifts its neighbours. A patch for a layer with no
  synth is reported, not silently dropped (the spec decides the shape: a return value or a `devWarn`).
- **Mute stays live; unmute of a never-built layer rebuilds.** Lowering a gain to 0 keeps the synth at gain 0, so a
  later unmute of that layer is live. Raising the gain of a layer that has no synth is the one case that goes
  structural (`applyLayersStructural` / `reReserveVoice`, a brief gap), because "I turned it up and heard nothing" is
  worse than the gap. Building every muted layer's synth up front is rejected: it spends nodes the Audio Load Budget
  exists to cap. (Crawford, Q1.)
- **The envelope edit sends only the envelope.** `updateVoiceEnvelope` stops re-stamping each layer's gain, detune,
  phase and pulse width from the composite's records and sends `{ adsr }` per layer; `updateVoicePortamento`, which
  has the same shape, the same. The diff would catch those writes anyway; the caller stops making them so the fix does
  not rest on the diff alone.
- **Callers keep sending whole layers.** `applyLayersContinuous` and the swell tick are unchanged; the composite is
  where the knowledge lives, so every caller gets the saving.
- **Measured, recorded, not gated.** T7's method, same session, before and after on the branch: the expectation is
  that the envelope bucket (0.22 → 0.49 % under glides) and the robot param writes (+0.37 points) fall back toward the
  37 build's figures. A miss means find out why, not stop the branch. (Crawford, Q2.)

## Style / constraint

- No muted layer gets a synth up front; no epsilon; no change to how voices are built beyond the unmute rebuild. The
  unmute rebuild is the one audio-architecture change and Crawford asked for it on 2026-10-27, so CLAUDE.md's "ask
  before changing the audio architecture" is met.
- RED first per symptom: the stale envelope patch; the index mismatch (edit to layer 1 of a `[0, 2]` voice lands on
  the right synth, layer 2's edit is not dropped); the unmute rebuild (and mute staying live); the equal-write skip,
  timed and untimed, for a setting and for a glided param. One commit per task, full suite at each checkpoint,
  mutation check on every new gate, stop at the gates for Crawford.
- Done when the suite is green, the before/after number is in PERFORMANCE.md, and Crawford's listen passes: a gain
  drag, an ADSR drag and a swell on one robot no longer undo each other, and a robot with a muted layer takes edits
  on the right layer.

## Measurement already in hand

- **CPU:** the phase setter under the swell tick on the 37 build is 0.03 % (0.01–0.04) of the idle window at 4×
  throttle, 1.1–3.2 ms per 6 s window, every lookup a cache hit (T7). Backlog 40 on its own would not justify a
  branch; what does is the shared mechanism above.
- **Audibility (2026-10-27, headless Chrome, native `AudioContext` 48 kHz, `Tone.Synth` at 250 Hz, ten
  `synth.set({ oscillator: { phase } })` writes 100 ms apart into a sustained note; residual `|x[n] − x[n−192]|`):**
  re-applying an identical phase leaves the output sample-exact with the steady note on both of Tone's paths — the
  native `type` reassign at phase 0 and the cache-hit `setPeriodicWave` at phase 90, for square, sine and pulse
  (residual 1e-5, the quiet floor). A **real** phase change is a 0.58–0.75 full-scale step on every write, which is
  the click a hand drag of phase makes. So the re-apply is a cost, never a pop. Crawford's ear agreed the same day: a
  detune drag at phase 90 was clean; a phase drag on a square clicked. The probe recipe goes in the spec:
  `Tone.Offline` cannot test a setting write mid-note (its scheduled callbacks run in a pre-pass before rendering),
  and Tone 15's `rawContext` is a standardized-audio-context wrapper, so the recorder needs a native context handed
  to `Tone.setContext`.

## Out of scope

- **The click a hand phase drag makes.** Tone applies a phase change by swapping the periodic wave on the sounding
  oscillator; each slider step is a 58–75 % full-scale discontinuity by design. Noted here and in the spec, not acted
  on; hiding it would take a rebuild at note release or a crossfade, neither on the table.
- **The pre-scheduled swell curve** (backlog 35's deferred item): the composite diff does not change that decision.
- **Any change to the swell tick** — it keeps sending whole layers through `applyLayersContinuous` and `applyAdsr`.
- **Backlog [27](../todo/archive/backlog-archive.md#27-audio-phone-playback-underruns-at-light-load-main-included)'s Light-tier
  interview** and anything else about how the graph is built.

## Known implementation notes (not yet spec'd)

- `createCompositeVoice` is handed the already-filtered layer list by `reserveVoice`; the robot index has to travel
  with each layer (the spec picks whether `filterAudibleLayers` returns `{ layer, index }` pairs or the composite is
  given the unfiltered list plus the audible predicate).
- `composite.layers` is read by `updateVoiceEnvelope`, `updateVoicePortamento` and tests; with the envelope caller
  sending only `{ adsr }` the records may no longer need to be exported as the `OscillatorLayer` shape.
- The equal-write skip must not skip the construction-time writes (they seed the records), and a rebuild
  (`reReserveVoice`) starts fresh records from the new build.
- The `[0, 2]` voice today receives `set({ layers: [l0, l1, l2] })`; the index-keyed version receives the same call and
  must route `l2` to the second synth — the existing `compositeVoice.test.ts` "match by index" cases pin the old
  position semantics and will change.
- T7's harness is the scratch `profile-raw.mjs` + `analyze.mjs` from the 37 session (not committed); the spec says
  where the before/after goes in PERFORMANCE.md and which link (S1: `charlie`, 200, −30) it uses.
