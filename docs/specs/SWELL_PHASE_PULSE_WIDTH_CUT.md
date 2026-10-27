# Phase Spec: Phase and Pulse Width Come Off the Swell Targets

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - The console check (§5.2): `npm run dev`, then
>   `npm run perf:audio -- --url http://localhost:<dev port>/trace-atlas/ --world "<world spec>" --seconds 120 --bucket 15`,
>   reading the `console:` line
> - The measurement (§5.3): `npx vite build --minify false --outDir <scratch> --emptyOutDir && npx vite preview --outDir <scratch> --port <port>`,
>   once for stock and once for the branch, then
>   `npm run perf -- --url "http://localhost:<port>/trace-atlas/?seed=charlie&x=200&y=-30&s=1.q1YqTlOyMjTTUSpOAdK1AA" --profile --throttle 4`

**Status:** spec written 2026-10-26. Backlog item
[37](../todo/backlog.md#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick), the first line of plan.md's
Stage 1. It stays a backlog item. Crawford made the decision on 2026-10-26 ("phase and pulse width come off the
swell targets", all six), so plan.md says spec → plan with no interview, and there is no intent file. Closes backlog
[36](../todo/backlog.md#36-audio-swells-on-pulsewidth-write-nan-into-the-voice-every-tick) with it. Backlog
[38](../todo/backlog.md#38-audio-swell-writes-land-as-steps-not-ramps) (swell writes become ramps) is planned to ride
the same branch afterwards under its own spec. Nothing in this spec depends on it.
Plan: [docs/tasks/SWELL_PHASE_PULSE_WIDTH_CUT.md](../tasks/SWELL_PHASE_PULSE_WIDTH_CUT.md).

§7 is resolved (Crawford, 2026-10-26):

1. Old saves are left as they are, and no load guard is built.
2. Parity case (e) narrows to the sends tail.
3. No world is remembered, so the console check uses S1 and the fallback.
4. The two findings are recorded as backlog
   [40](../todo/backlog.md#40-audio-every-layer-write-re-applies-every-layers-phase) and
   [41](../todo/backlog.md#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers), placed next in
   plan.md after 37.
5. The `[0, 24]` doc error is fixed.

Each question below carries its Decided line.

---

## 1. Overview & Claude Explanation

The robot swell pool (`SWELL_ROBOT_ATTRIBUTE_IDS`, [audioSwell.ts](../../src/types/audioSwell.ts)) has 22 targets.
Six of them are `layer0`–`layer2` `.phase` and `.pulseWidth`. Both are oscillator **settings**, not Params. A swell
writes them every `16n` through `applyLayersContinuous` → `AudioEngine.updateVoiceLayerParams` → the composite's
`set` → `applyOscFieldViaSet` ([compositeVoice.ts](../../src/engine/audioEngine/compositeVoice.ts)) →
`synth.set({ oscillator: { phase | width } })`. They come off the pool, and with them every type, range and flag
that exists only because they were swell targets.

**Why phase goes: it costs the most and the cost is audible.** Tone's `phase` setter re-runs its `type` setter
(`Oscillator.js`). That setter looks for a cached periodic wave with the same type and phase, `_periodicWaveCache`,
which holds 100 entries. On a miss it computes the partials, calls the native `createPeriodicWave`, and calls
`setPeriodicWave` on the **sounding** oscillator. A swelling phase is a new value on nearly every tick, so nearly every
tick misses. Backlog 35's Task 12 measured this
([PERFORMANCE.md](../PERFORMANCE.md#the-swell-ticks-main-thread-share-task-12)) on the swell-heavy link at 4× throttle:

- The phase setter took 1.82–4.10 % of the idle window's sampled time. That is most of the swell tick's 4.13–6.45 %.
- In one run, `createPeriodicWave` was 210 of `updateVoiceLayerParams`' 310 ms.

The steady-state review ranks it first among things that can pop
([PERFORMANCE.md](../PERFORMANCE.md#steady-state-review--what-runs-continuously-and-which-of-it-can-pop-2026-10-26)):
every tick swaps the waveform mid-note.

**Why pulse width goes: it is broken and plays nothing.**

- `OscillatorLayer.pulseWidth` is optional ([layeredAudio.ts](../../src/types/layeredAudio.ts)), and no generator
  seeds it. So on a robot nobody has edited:
  - `readRobotValue` returns `undefined` for every pulse-width swell.
  - The swell's arithmetic makes `NaN`.
  - Every tick writes `NaN` (backlog 36's flood).
- When the value is finite, Tone reads `width` only on a pulse oscillator. The Interval slider is shown for that
  type alone (`SignatureArrayDrawer.tsx`'s `showPulseWidth`; [ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md)).
  So a pulse-width swell on any other layer moves nothing you can hear.
- Its CPU share was small (0.05–0.12 %). It goes because it is wrong, not because it is slow.

**What 36's "store check" found (code read, 2026-10-26).** The NaN reaches the store. `applyLayersContinuous` writes
the layers array it is given, so mid-swell the robot's layer holds `pulseWidth: NaN`. The return-to-base write then
stores `pulseWidth: undefined` (the captured base). A save made mid-swell carries the NaN out of the app:

- `sessionDiff.ts`: the base lookup finds `undefined`, so it falls back to the live `NaN`. In JSON that becomes
  `null`.
- `worldDiffCodec.ts`: encodes `pw` whenever `pulseWidth !== undefined`, so a link carries `pw: null`.

On load, `buildRobotUpdates` applies `diff.layers` unvalidated. The composite then hands the `null` to
`applyOscFieldViaSet` at the next voice build. On a pulse layer, Tone's assert throws; the throw is caught and logged
with `devWarn`. Nothing crashes. After this change, no new save can carry a non-finite pulse width. Saves made
before it still can, and they are left as they are (§7 question 1, decided).

**A correction to backlog 36's note.** It says Crawford saw the flood "in dev and production". The warning is
`devWarn` ([helpers.ts](../../src/utils/helpers.ts)), which logs only when `import.meta.env.DEV`. A production build
cannot print it. That is also why backlog 35's console tally, run on production builds, never saw it. The console
check here (§5.2) therefore runs against the dev server.

**What changes for a seeded world.** Both robot pickers index into the attribute list:

- The single-robot path indexes over the eligible (robot, attribute) pairs.
- The company path indexes over `SWELL_ROBOT_ATTRIBUTE_IDS` itself.

Removing six entries shifts the indices, so the same seed picks different swells from the first roll on. This is
accepted. Pre-v1, a world's swell sequence is not a contract
(Crawford, 2026-10-14: no "keep the existing sound" constraint before v1). The remaining 16 targets are each picked about 22/16 as often.
That includes layer gain and detune, whose writes are the staircase backlog 38 fixes. So 38's audible problem gets
more frequent between this item and 38. That is one reason they share a branch.

**What stays:**

- The Phase and Interval sliders: a hand edit still writes the setting once per drag step.
- `OscillatorLayer.phase` and `.pulseWidth` on the type and in sessions and links.
- The composite's phase and pulse-width write paths. Construction and hand edits use them.

Neither field is an LFO target any more (LFO_LOAD_FIX, LFO_BANK), and nothing else in the app writes them
periodically.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── audioSwell.ts                     # SwellRobotAttributeId and SWELL_ROBOT_ATTRIBUTE_IDS lose the six; doc comment 22 → 16
│   └── audioSwell.test.ts                # the count and membership cases follow (22 → 16)
├── data/
│   ├── audioSwellRanges.ts               # ROBOT_SWELL_FIELD_RANGE loses the six keys (the Record type enforces it)
│   └── audioSwellRanges.test.ts          # follows
├── systems/
│   ├── audioSwells.ts                    # LAYER_FIELD_PATTERN narrows to gain|detune; no other logic changes
│   ├── audioSwells.test.ts               # RED: neither robot path ever starts a phase or pulse-width swell (§5.1)
│   └── robotSendsParity.test.ts          # case (e) narrows to "the five sends are the tail" (§7 Q2)
├── components/
│   ├── robot/useSwellingFlags.ts         # LayerSwellingFlags drops phase and pulseWidth (the compiler finds the reads)
│   ├── robot/SignatureArrayDrawer.tsx    # the Phase and Interval sliders lose their `swelling` prop
│   ├── robot/SignatureArrayDrawer.test.tsx  # cases that forward a phase or pulse-width swelling flag go
│   ├── company/useCompanyOptions.ts      # LayerSwelling drops phase and pulseWidth
│   └── company/useCompanyOptions.test.ts # follows
└── utils/
    └── sessionDiff.ts                    # the phase and pulseWidth base lookups go
docs/
├── AUDIO_SYSTEM.md                       # Audio Swells' robot pool: 22 → 16, and why the two settings left; Frequency [0, 16]
├── PERFORMANCE.md                        # the console check and the A/B (§5.2, §5.3), beside Task 12
└── todo/backlog.md, plan.md              # 36 and 37 Built lines; 40 gains §5.3's number; at merge 36 and 37 archive, 37's plan line goes
```

No new file under `src/`. No new dependency.

---

## 3. Implementation Boundaries & Constraints

- **Removal, not a gate.** The six ids leave the union and the list. The pool does not keep them and filter them
  out, and no new eligibility rule is added. `isRobotAttributeStructurallyLive` and `readRobotValue` keep their
  shapes. `LAYER_FIELD_PATTERN` narrows to `gain|detune` so it cannot match a name the type no longer has.
- **Order of what remains.** `volume`, then `layer0`–`layer2` `.gain` and `.detune`, then the four ADSR fields, then
  the five sends from `ROBOT_SEND_FIELDS`, still last ([ROBOT_SEND_TABLE.md](ROBOT_SEND_TABLE.md) §1.5). This keeps
  the existing ordering rule, not the old indices: §1 accepts that the indices move.
- **The settings paths stay.** `applyOscFieldViaSet` and the composite's `phase` and `pulseWidth` branches stay, for
  construction and hand edits. Changing what the composite writes per call is §7 question 4, not this item.
- **Hand-edit cancels stay as they are.** `RobotScreen.handleLayerParamChange` and
  `useCompanyOptions.onLayerParamChange` call `cancelSwellForRobotAttribute` with
  `` `layer${idx}.${field}` as SwellRobotAttributeId `` for every layer field. For phase and pulse width that becomes
  a lookup that never matches, which is a no-op. The cast was already there (the template string widens to
  `string`). Adding a guard would add a branch to protect nothing.
- **sessionDiff's two lookups go.** `extractSwellBaseValueIfActive` for `layerN.phase` and `layerN.pulseWidth` can
  no longer find a swell. The capture reads `layer.phase` and `layer.pulseWidth` directly, as the baseline beside it
  already does. This is a pure deletion with no test, by CLAUDE.md.
- **Names that stay because they are not swell targets.** Do not touch:
  - the `layer0.phase` LFO-link cases in `worldDiffCodec.test.ts` and `AudioEngine.test.ts` (old ids the loaders drop);
  - the `robotOptions.layerN.pulseWidth` content keys;
  - `ActiveSwell.phase` / `SwellPhase` (rising and falling, a different word).
- **Not built from backlog 36:** the "refuse non-finite writes" guard on the write path, because its only source is
  gone. No load guard either. Saves made before this change keep any `pulseWidth: null` they carry (§7 question 1,
  decided). That is harmless: at most a dev warning when a pulse layer's voice is built.
- **CLAUDE.md rules stand.** No Tone construction outside the engine, state stays serialisable, and nothing new is
  stored.
- **Not in scope:**
  - backlog 38 (ramps), which comes next on the branch with its own spec;
  - backlog 39 (re-renders);
  - backlog 27 (the interview);
  - backlog 40 and 41 (§7 question 4's findings), next in plan.md after this item;
  - anything about swell rates, Intensity or Duration.

---

## 4. Code Style & Architecture Conventions

```typescript
// src/types/audioSwell.ts — shape, not final code
export type SwellRobotAttributeId =
  | 'volume'
  | 'layer0.gain' | 'layer0.detune'
  | 'layer1.gain' | 'layer1.detune'
  | 'layer2.gain' | 'layer2.detune'
  | 'adsr.attack' | 'adsr.decay' | 'adsr.sustain' | 'adsr.release'
  | RobotSendField;

// src/systems/audioSwells.ts
const LAYER_FIELD_PATTERN = /^layer(\d)\.(gain|detune)$/;
```

- Doc comments say what the pool is now and give the reason in one sentence, with a pointer to this spec. They do not
  narrate the removal: no "used to include", no "removed in". The history lives in AUDIO_SYSTEM.md and the backlog
  archive. The existing comment on `SwellRobotAttributeId` loses its phase and pulse-width justification paragraph.
- Tests are colocated, as today. Each test calls the code it checks, and none reads source text.
- `devWarn` from `src/utils/helpers` for any new failure path, never `console.*`.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first where there is behaviour)

1. **The pool never picks them** (`audioSwells.test.ts`). This is the behaviour test, written RED against today's
   pool.
   - **Setup:** a roster whose robots have all three layers at nonzero gain, so every layer field is structurally
     live.
   - **Single-robot path:** sweep the `'audioSwell.target.robot'` noise value across its range so every
     eligible-pair index is drawn. Assert the set of started `robotAttribute`s equals `SWELL_ROBOT_ATTRIBUTE_IDS`
     minus any send at 0, and contains no id ending in `.phase` or `.pulseWidth`.
   - **Company path:** the same sweep over `'audioSwell.company.attribute'`.
   - **Proof it can fail:** today both sweeps start a `layerN.phase` and a `layerN.pulseWidth` swell.
   - **Mutation check:** put one id back in the list and the test fails.
2. **The list** (`audioSwell.test.ts`, `audioSwellRanges.test.ts`, existing cases updated, not new RED):
   - 16 members, no duplicates, in the order in §3;
   - `ROBOT_SWELL_FIELD_RANGE`'s keys equal the list.
3. **The flags** (`useCompanyOptions.test.ts`, `SignatureArrayDrawer.test.tsx`, existing cases): the cases that forward
   a phase or pulse-width swelling flag are deleted. The gain and detune cases stay unchanged. The compiler enforces
   `useSwellingFlags.ts`, because its template strings are typed `layer0|1|2.phase`, which is no longer a
   `SwellRobotAttributeId`.
4. **The load guard: not built** (§7 question 1, decided).
5. **Parity case (e)** (`robotSendsParity.test.ts`) narrows to "the five sends are the pool's tail, in table order"
   (§7 question 2, decided). It is a test-only change that passes before and after.

Not tested, by CLAUDE.md's "no RED test for a task with no behaviour":

- sessionDiff's two deleted lookups;
- the narrowed `LAYER_FIELD_PATTERN` (covered by test 1);
- the doc comments and docs, whose proof is a read.

### 5.2 The console check (a run, not a test)

The proof that backlog 36's flood is gone. `devWarn` prints only in dev, so both builds are served by `npm run dev`:
stock from a clean `git worktree` of the branch base, the branch from its own checkout, on two ports. Run
`perf:audio`'s console tally for 120 s on each. Foreground, one run per call, orphaned Chrome 0
([PERFORMANCE.md](../PERFORMANCE.md) hygiene).

**Prove the metric first.** Stock must show the line `[AudioEngine] Failed to set pulseWidth on composite layer`, or
the check detects nothing. The candidate world is S1 (charlie, 200, −30, Swell Frequency 16, Duration 1). §7 question
3 covers what happens if stock does not show the line there.

**Criterion:**

- the pulse-width line is **absent** on the branch;
- no new console line appears that stock did not have.

Dev-mode capacity numbers are not compared, because a dev build is not a fair audio measurement.

To check first: whether `perf:audio` runs against the dev server unchanged (its `--url` flag suggests so, and its
pin check reads the `?debug` overlay, which dev serves too).

### 5.3 The measurement (backlog 37's "before and after")

Task 12's method, repeated as a same-session A/B, because absolute numbers drift 15–35 % between sessions:

- **Builds:** stock (the branch base) and the branch, each built unminified to its own scratch `--outDir` and served
  on its own port.
- **Runs:** S1 only, three runs each, interleaved (stock, branch, branch, stock, stock, branch), 4× throttle.
- **Reading:** the idle window's raw CPU profile. `profile.mjs` prints only the top 20, so this needs a scratch copy
  that also saves the raw profile and the long-task entries, as Task 12's did. That copy was not kept and is rebuilt
  in scratch, not committed.

Record in PERFORMANCE.md, beside Task 12, medians and min–max for:

- `tickAudioSwells` inclusive;
- the tick with the store half excluded;
- the oscillator-settings bucket (`applyOscFieldViaSet`) under the tick, split into Tone's `phase` setter and native
  `createPeriodicWave`;
- long tasks in the window and how many hold tick time.

**Expected, recorded, not gated:**

- `createPeriodicWave` under the tick falls to about 0 on the branch. With no phase churn, the roster's fixed
  (type, phase) pairs (at most 36) stay in the 100-entry cache.
- The tick's share falls by roughly the stock settings bucket.

The phase setter will **not** fall to 0. Every gain, detune and ADSR write still re-applies each layer's unchanged
phase (backlog 40), and this run is what sizes that cost.

### 5.4 The listen (Crawford): Checkpoint before backlog 38 starts

A few minutes on S1 at Full on the desktop, stock against branch. Phase swells swapped the waveform mid-note, so
some pops may go. Nothing new should appear. The swells you hear are now volume, gain, detune, ADSR and sends. Gain
and detune still step until 38.

### 5.5 Checks

`npm run build:types`, `npm run lint`, `npm test` and `npm run build` all clean. Run the full suite at each
checkpoint, and types plus lint after each task.

### 5.6 Done when

- [ ] `SWELL_ROBOT_ATTRIBUTE_IDS` has 16 ids in §3's order, and `ROBOT_SWELL_FIELD_RANGE` matches it.
- [ ] Test 1 passes, and putting any one of the six back fails it.
- [ ] No phase or pulse-width swelling flag exists in the robot screen or the company options.
- [ ] §5.2 on the branch: the pulse-width line is absent, with the metric proven on stock (or §7 Q3's fallback recorded).
- [ ] §5.3 recorded in PERFORMANCE.md with both builds' numbers.
- [ ] Crawford's listen passed.
- [ ] AUDIO_SYSTEM.md's robot pool paragraph describes 16 targets.
- [ ] Backlog 36 and 37 carry Built lines.
- [ ] Every check in §5.5 is clean.

---

## 6. Git & Workflow Context

- **Branch:** `fix/swell-targets`, off `main` (`959a989b` or later). Backlog 38 follows on the same branch with its
  own spec and plan. The uncommitted steady-state review on `docs/steady-state-review` (38's and 39's entries)
  merges first or is carried, as Crawford decides.
- **Tasks:** in order, one commit each, RED first where there is behaviour. The plan fixes the exact list.
  1. The pool test RED, then the type, list and ranges, with the pattern narrowed and the existing count cases
     updated.
  2. The flags and the two sliders' `swelling` props, with their test cases.
  3. sessionDiff's lookups (a deletion).
  4. Parity case (e), narrowed (§7 Q2).
  5. The console check (§5.2, recorded).
  6. The A/B (§5.3, recorded).
  7. Checkpoint: Crawford's listen.
  8. Docs: AUDIO_SYSTEM.md, including Frequency `[0, 16]`, and the type's doc comment.
  9. The backlog: Built lines on 36 and 37, and §5.3's number under 40. At merge, 36 and 37 go to the archive in the
     usual way and 37's plan.md line is deleted.
- **Type safety per commit:** each commit type-checks. The list change and its consumers land together where the
  compiler requires it.
- **Commit messages:** short and imperative, naming the proof ("RED then green: …", "a deletion", "a read", "the
  run"). The PR is Crawford's.

---

## 7. Open Questions

1. **Clean old saves on load?** A session or link saved during a pulse-width swell, before this change, can carry
   `pulseWidth: null`. That is harmless but logs a dev warning at each voice build of a pulse layer.
   - **(a)** The load path drops a non-finite `pulseWidth`, so the layer loads without the key. This is one guard
     where session and link restores meet, in the shape of `validArticulation`'s `Number.isFinite` checks, plus one
     RED test.
   - **(b)** Nothing. Pre-v1, the affected saves are Crawford's own, and re-saving clears them.

   **Recommendation: (a).** It is small, the bad value is otherwise permanent in any link already shared, and it is
   the store check backlog 36 handed to 37.
   **Decided (Crawford, 2026-10-26): (b).** "I don't care about old saves." No load guard is built.
2. **The parity oracle's case (e).** `robotSendsParity.test.ts` pins the whole 22-id pool and says "NEVER
   RE-RECORD". It was roadmap 55's oracle for a refactor that has since merged, and this item changes the pool on
   purpose.
   - **(a)** Narrow case (e) to what roadmap 55 owned: the five sends are the pool's tail, in table order. The full
     list stays pinned in `audioSwell.test.ts`.
   - **(b)** Re-record the 16. That breaks the file's own rule.
   - **(c)** Delete case (e).

   **Recommendation: (a).** Cases (a)–(d) and the swell-tick prime recording are untouched: the tick case picks the
   last eligible pair, which is still a send.
   **Decided (Crawford, 2026-10-26): (a).**
3. **The console check's world.** Which world did you see the flood on? If you have it, it's the candidate. If not:
   - try S1 on stock for 120 s;
   - if the line does not appear, try one 300 s run;
   - if it still does not appear, record the check as unproven and let test 1 carry the proof.

   **Decided (Crawford, 2026-10-26):** no world remembered, so S1 and the fallback as written.
4. **Two findings from writing this, both code reads, neither tested, both outside 37.** Each would become a backlog
   item, recorded, not built.
   - **(i) Every layer write re-applies every layer's phase.** `updateVoiceLayerParams` hands the composite the full
     layers array, and the composite's `set` writes `phase` whenever it is defined, which is always (the field is
     required). Every gain or detune swell tick, and every ADSR write, therefore re-runs Tone's `type` setter on each
     sounding layer:
     - with phase 0 and a basic type, a native `type` assignment;
     - otherwise, a cache lookup and `setPeriodicWave` on the sounding oscillator.

     §5.3 sizes it for free. The fix would be "write a setting only when it changed".
   - **(ii) `updateVoiceEnvelope` re-applies construction-time layers.** It rebuilds its patch from
     `composite.layers`, the `layer` each node was built with. `set` never updates those. So an ADSR edit or ADSR
     swell writes the build-time gain, detune, phase and pulse width back over any hand edit or swell made since. The
     store keeps the edited value, and the engine reverts until the next layer write. A test would confirm it in a
     few lines.

   **Recommendation:** record both as backlog items after §5.3. Crawford decides whether either is fixed, per the
   finish-the-branch rule.
   **Decided (Crawford, 2026-10-26):** both are recorded now, as backlog
   [40](../todo/backlog.md#40-audio-every-layer-write-re-applies-every-layers-phase) (i) and
   [41](../todo/backlog.md#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers) (ii), and they are
   next in plan.md after this item. §5.3 adds its number to 40. Checking (ii) against the code found a third symptom
   with the same cause, which 41 carries. The composite builds no synth for a layer muted at build time, but later
   updates match layers by position. So on a robot whose middle layer started muted, an edit to a later layer can land
   on the wrong oscillator, or on none.
5. **A doc error in the same section.** AUDIO_SYSTEM.md's Audio Swells says Swell Frequency runs `[0, 24]`, but the
   code's maximum is 16 (noted at backlog 35's close). **Recommendation:** fix it in the docs task, since it is one
   value in the section this item already edits.
   **Decided (Crawford, 2026-10-26): fix it**, in the docs task.
