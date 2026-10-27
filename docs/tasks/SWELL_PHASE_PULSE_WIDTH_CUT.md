# Implementation Plan: Phase and Pulse Width Come Off the Swell Targets, and Timed Swell Writes Glide

Spec: [docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md](../specs/SWELL_PHASE_PULSE_WIDTH_CUT.md). Backlog slots:
[37](../todo/backlog.md#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick), the first line of plan.md's Stage 1,
and [38](../todo/backlog.md#38-audio-swell-writes-land-as-steps-not-ramps), which Crawford folded in on 2026-10-26
(spec §8). It closes [36](../todo/backlog.md#36-audio-swells-on-pulsewidth-write-nan-into-the-voice-every-tick). There is
no intent file: Crawford decided 37 on 2026-10-26 with no interview, and 38's fix was in its backlog item. Build branch:
`fix/swell-targets` off `main` at `12008fd9`. One PR closes 36, 37 and 38.

**Spec §7 is resolved** (Crawford, 2026-10-26). The Architecture Decisions record each answer:

- Q1 (b): old saves are left alone, so T5, the load guard, is removed.
- Q2 (a): parity case (e) narrows.
- Q3: S1 and the fallback.
- Q4: the findings are backlog 40 and 41, next in plan.md after this branch.
- Q5: the doc range is fixed.

**Spec §8.6 is resolved** (Crawford, 2026-10-26):

- Q6 (b): every timed write glides, robot volume, the sends and the filter cutoffs included.
- Q7 (a): a glide lasts one 16th note at the live tempo.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`
(the console check), `npm run perf:audio`, `npm run perf -- --profile --throttle 4`.

The planning skill's default output paths, `tasks/plan.md` and `tasks/todo.md`, are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".

## Overview

The robot swell pool loses `layer0`–`layer2` `.phase` and `.pulseWidth`, going from 22 targets to 16. With the pool go
the per-layer "swelling" flags for those two fields and sessionDiff's base lookups for them. Older saves that carry a
`pulseWidth: null` are left as they are (spec §7 Q1).

The work is ordered so **every commit type-checks and the suite stays green**. Three small tasks (T1–T3) first remove
everything that names the six ids from outside the swell system. Then T4 shrinks the type, the list and the ranges
behind a RED test that sweeps both robot pickers. T5 was the load guard and is removed (§7 Q1); its number is kept so
references stay stable. Checkpoint A closes 37's code.

Backlog 38 follows as T10–T12, numbered after T9 so that 37's numbers stay stable:

- T10: a getter for one tick's length;
- T11: the two write leaves glide, with their callers;
- T12: Auto pan glides.

Two runs follow: the console check (T6), and the measurement (T7) on three builds: stock, 37 alone, and 37 + 38.
Crawford listens at Checkpoint B. Docs (T8) and the backlog (T9) close it.

Each task names its **Proof** (TASK_TEMPLATE.md):

- a RED test for the five that change behaviour (T2, T4, T10, T11, T12);
- a run for T6 and T7;
- a Read for T0, T1, T3, T8 and T9.

One commit per task. No docs guards and no source scans (CLAUDE.md, 2026-10-23).

## Architecture Decisions

- **Removal, not a filter** (spec §3). The six ids leave `SwellRobotAttributeId`, `SWELL_ROBOT_ATTRIBUTE_IDS` and
  `ROBOT_SWELL_FIELD_RANGE`. No eligibility rule is added, and `isRobotAttributeStructurallyLive` and `readRobotValue`
  keep their shapes. `LAYER_FIELD_PATTERN` narrows to `gain|detune`. What remains keeps the existing order rule:
  `volume`, layer gain and detune, ADSR, then the sends last from `ROBOT_SEND_FIELDS`.
- **The index shift is accepted** (spec §1). Both pickers index into the list, so a seed's picks move. Pre-v1 there is no
  "keep the existing sound" constraint. Any existing test whose expectation names *which* attribute a draw picked is
  updated in T4, and each one is named in the commit message.
- **Outside consumers first, so the compiler never sees a dangling name** (ordering).
  - `useSwellingFlags.ts` builds `` `layer${index}.phase` `` with `index: 0 | 1 | 2`, a literal template type that stops
    being a `SwellRobotAttributeId` the moment the union shrinks. So the flags lose the two fields before the union does
    (T2).
  - sessionDiff's four `as SwellRobotAttributeId` casts on `` `layer${layerIndex}.phase` `` may also be rejected as a
    non-overlapping conversion. Its two lookups are removed first (T3).
  - The robot-screen and company cancel paths cast `` `layer${idx}.${field}` ``, where `field` includes `gain` and
    `detune`. That overlaps the new union, so those casts compile, and spec §3 keeps them as no-ops.
  - If the compiler rejects any other cast at T4, the fix lands in T4 and is recorded as a deviation.
- **Resolves spec §7 question 2: (a), parity case (e) narrows, first** (T1). `robotSendsParity.test.ts` case (e) pins all
  22 ids. It narrows to what roadmap 55 owned: the five sends are the pool's tail, in `ROBOT_SEND_FIELDS` order. The
  full list is pinned in `audioSwell.test.ts`. The narrowed case passes before and after T4, so T1 can land first. Cases
  (a)–(d), and the swell-tick prime recording (it picks the last eligible pair, a send), stay untouched, and the file's
  "never re-record" rule holds for every recording.
- **The behaviour test asserts a literal, not the list** (T4). A sweep whose expected set is
  `SWELL_ROBOT_ATTRIBUTE_IDS` passes today, since 22 equals 22, and proves nothing. The sweep asserts two things: no
  started attribute matches `/\.(phase|pulseWidth)$/`, and the started set equals a literal 16-id array.
- **Resolves spec §7 question 1: (b), no load guard.** Crawford: "I don't care about old saves." A save made during a
  pulse-width swell before this branch keeps its `pulseWidth: null`, which is harmless: at most a dev warning when a
  pulse layer's voice is built. Backlog 36's write-path refusal is not built either (spec §3). For the record, should
  this ever be revisited: share links decode into the same `SessionPayload` that `applySessionPayload` →
  `buildRobotUpdates` applies, so one guard there would cover both.
- **The type's doc comment changes with the type** (T4, not T8). Leaving it to the docs task would leave a comment on
  `SwellRobotAttributeId` that is false for four commits.
- **The runs prove their metric first** (perf-harness hygiene).
  - T6 must see the pulse-width warning on stock before the branch's absence means anything. It runs on `npm run dev`,
    because `devWarn` is silent in production.
  - T7 is a same-session A/B, because absolute numbers drift 15–35 % between sessions.
- **Resolves spec §7 question 4: the findings are recorded, not built here.** They were opened with T0 as backlog
  [40](../todo/backlog.md#40-audio-every-layer-write-re-applies-every-layers-phase) (every layer write re-applies every
  layer's phase) and [41](../todo/backlog.md#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers)
  (the composite's layer records drift: the stale envelope patch, plus the position mismatch found on the check). They
  sit next in plan.md after this branch. T9 adds T7's residual number to 40.
- **Resolves spec §7 question 5: the `[0, 24]` doc error is fixed in T8**, beside the paragraph T8 already edits.
- **38: a write with a time glides one tick** (spec §8.2; resolves §8.6 Q6 (b) and Q7 (a)).
  - **Where the change lands:** only Transport ticks pass a time (the swell tick since backlog 35, and Auto pan from
    T12). So the time-carrying branch of the two leaves in `voiceEntry.ts` is where the change goes, and no caller
    changes its logic:
    - `setOrPoint` becomes `setOrGlide`;
    - `rampOrSet`'s timed branch uses the tick length in place of `rampSeconds`;
    - untimed calls stay byte-for-byte today's.
  - **The tick length:** it comes from BeatClock (T10). `TransportLike` gains an optional `toSeconds(time)`, which Tone's
    Transport already has, and `getTickSeconds()` returns `transportInstance.toSeconds('16n')`, or `undefined` without a
    transport. That follows beatClock's "no Tone import here" rule.
  - **Without a tick length, a timed write stays a point at `time`** (today's behaviour). A timed write with no
    transport cannot happen in the app, so this exists only for the headless and test path.
- **38 lands after Checkpoint A.** That keeps 37's code reviewable alone, and T7's middle build (the commit after T4)
  isolates 37's number from 38's.

## Dependency Graph

```
T0 (spec Status: Crawford's answers; backlog 37 pointer; 40 and 41 opened)
        │
   ┌────┼──────────────────┐
T1 (parity (e)       T2 (layer swelling      T3 (sessionDiff's
    narrowed)            flags: gain+detune)     phase/pw lookups go)
   │                  │                        │
   └────────┬─────────┴────────────────────────┘
            │
T4 (the pool: RED sweep; union, list, ranges, pattern, doc comment)
            │
      Checkpoint A (37's code: full suite, types, lint, build; Crawford reviews)
            │
T10 (BeatClock: getTickSeconds, one 16n at the live tempo)
            │
T11 (the leaves glide: setOrPoint → setOrGlide, rampOrSet's timed branch; composite + globalFx callers)
            │
T12 (Auto pan: updateAllPanners passes its time and glides)
            │
      Checkpoint A2 (38's code: full suite, types, lint, build)
            │
T6 (console check on dev: stock shows the line, branch does not; recorded)
            │
T7 (same-session measurement, S1: stock / 37 / 37+38, 3 runs each; recorded)
            │
      Checkpoint B (Crawford reads T6/T7 and listens: 37's part and 38's glide)
            │
T8 (AUDIO_SYSTEM.md: the 16-target pool; [0, 24] → 16; timed writes glide. BEAT_CLOCK.md if needed)
            │
T9 (backlog: Built lines on 36, 37 and 38; T7's number under 40)
            │
      Checkpoint: Complete
```

T1, T2 and T3 are independent and can land in any order, but each must land before T4.

## Task List

### Phase 0: The slot

- [x] **Task 0: `docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md`, `docs/todo/backlog.md`, `docs/todo/plan.md`: status
  lines, and 40 and 41 opened** *(written 2026-10-26, in the working tree on `docs/steady-state-review`; it becomes
  the branch's first commit)*

  **Description:**
  - The spec's **Status** paragraph records Crawford's five answers and links this plan. Each §7 question carries a
    **Decided** line.
  - Under backlog 37, one paragraph points at the spec, this plan and the branch, and records the store check's result.
  - Backlog 40 and 41 are opened from §7 Q4 (41 includes the position mismatch found while checking (ii) against the
    code).
  - plan.md lists them next after 37.
  - This plan was reshaped to match: T5 removed, and every "assumes" made a decision.

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [x] Each §7 question carries a dated Decided line.
  - [x] Backlog 37 links the spec, this plan and `fix/swell-targets`. 40 and 41 each have Found, Cause, To check first,
        and a Fix that is not decided.
  - [ ] Every link and anchor resolves. Checked at the commit.

  **Verification:**
  - [ ] Manual read of the four diffs. Anchors checked against the headings they target.

  **Dependencies:** Crawford's answers to spec §7 (given 2026-10-26).

  **Files:** `docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md`, `docs/todo/backlog.md`, `docs/todo/plan.md`, this plan

  **Estimated scope:** XS (docs only)

### Phase 1: The pool

- [x] **Task 1: `src/systems/robotSendsParity.test.ts`: case (e) narrows to the sends tail** *(§7 Q2 (a))*

  **Description:**
  - Case (e), "the robot swell pool is the recorded 22 ids, the five sends its tail in table order", becomes "the five
    sends are the robot swell pool's tail, in table order". It asserts `SWELL_ROBOT_ATTRIBUTE_IDS.slice(-5)` equals the
    recorded send order, and no other send id appears earlier in the list.
  - The `SWELL_POOL` constant goes, and so does its entry in the self-check case's list.
  - Nothing else in the file changes. The "NEVER RE-RECORD" header gains one sentence: case (e) was narrowed when
    backlog 37 changed the pool on purpose, and no recording was touched.

  **Proof:** Read. It is a test-only change that must pass both on today's code and after T4, so it has no RED. Its
  check is that it still fails for the thing it guards.

  **Acceptance criteria:**
  - [x] Case (e) passes on today's 22-id list.
  - [x] Every recording constant is byte-identical. `git diff` shows only case (e), `SWELL_POOL`, the self-check list
        and the header sentence.

  **Verification:**
  - [x] `npx vitest run src/systems/robotSendsParity.test.ts` passes.
  - [x] Mutation: swap two sends in `ROBOT_SEND_FIELDS`' order, or move `reverbSend` ahead of `adsr.release` in the
        list, and case (e) fails. Then revert.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/systems/robotSendsParity.test.ts`

  **Estimated scope:** XS (one test case)

- [x] **Task 2: the layer swelling flags drop `phase` and `pulseWidth`**

  **Description:**
  - `useLayerSwellingFlags` (`src/components/robot/useSwellingFlags.ts`) returns `{ gain, detune }`, and
    `LayerSwellingFlags` loses the two fields.
  - The company options' `LayerSwelling` (`src/components/company/useCompanyOptions.ts`) loses the same two.
  - `SignatureArrayDrawer.tsx` stops passing `swelling={swelling?.phase}` to the Phase slider and
    `swelling={swelling?.pulseWidth}` to the Interval slider. Both now ease like any un-swelled slider.
  - The drawer's `swelling` prop type, `Partial<Record<field, boolean>>`, is left as it is. It already allows absent
    keys.
  - Until T4, a phase swell can still run, and its slider will ease a second time. That is accepted for the commits in
    between.

  **Proof:** RED test, `src/components/robot/useSwellingFlags.test.ts`. The existing case at line ~49
  (`toEqual({ gain, detune, phase, pulseWidth })`) changes its expectation to `{ gain: index === 1, detune: false }`,
  with a swell mocked on `layer${index}.gain`. It fails on today's hook, which returns four keys.

  **Acceptance criteria:**
  - [x] The hook returns exactly `gain` and `detune` for each layer index, and `undefined` without a robot (existing
        case, unchanged).
  - [x] The robot screen and the company options still forward a layer's gain and detune flags to their sliders.
        Existing tests pass unmodified apart from the hook case above. *As run (1afa92f4): one more, the company options'
        "are read from the first member only" case, probed with `layer2.phase` and now probes `layer2.detune`.*
  - [x] `isRobotAttributeSwelling` is never asked about a `.phase` or `.pulseWidth` id from either screen.

  **Verification:**
  - [x] `npx vitest run src/components/robot/useSwellingFlags.test.ts src/components/robot/SignatureArrayDrawer.test.tsx src/components/company/useCompanyOptions.test.ts`
        passes.
  - [x] Mutation: put `phase` back in the hook's object, and the case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/components/robot/useSwellingFlags.ts`, `src/components/robot/useSwellingFlags.test.ts`,
  `src/components/company/useCompanyOptions.ts`, `src/components/robot/SignatureArrayDrawer.tsx`

  **Estimated scope:** S (four files, all removals plus one expectation)

- [x] **Task 3: `src/utils/sessionDiff.ts`: the phase and pulse-width base lookups go**

  **Description:**
  - In `computeRobotAudioOverrideDiff`, `layersToCapture` reads `phase: layer.phase` and `pulseWidth: layer.pulseWidth`
    directly, the same as `baselineLayersNormalized` beside it.
  - The two `extractSwellBaseValueIfActive(…, \`layer${layerIndex}.phase|pulseWidth\` as SwellRobotAttributeId)` calls
    go. The gain and detune lookups stay.
  - Until T4, a save made during a phase swell captures the interpolated phase. That is accepted for the commits in
    between.

  **Proof:** Read. A deletion, by CLAUDE.md. Existing sessionDiff tests are the parity check.

  **Acceptance criteria:**
  - [x] Only the two lookup expressions change.
  - [x] Every existing case in `sessionDiff.test.ts` passes unmodified, including "with a swell in flight".

  **Verification:**
  - [x] `npx vitest run src/utils/sessionDiff.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/utils/sessionDiff.ts`

  **Estimated scope:** XS (two expressions)

- [x] **Task 4: the robot swell pool drops the six ids**

  **Description:**
  - Write the RED test first, in `src/systems/audioSwells.test.ts`, as a new `describe` named after spec §5.1 test 1:
    - **Fixture:** one robot with three layers, all at nonzero gain (`type: 'sine'`, no `pulseWidth`, exactly what
      generation produces), and all five sends above 0. Every one of the 22 old ids is then structurally live.
    - **Single-robot sweep:** for each eligible-pair index, a fresh `stopAudioSwells()`, then one tick under
      `noiseMapForDataIds` that forces `audioSwell.trigger.robot` to fire, forces `audioSwell.company.chance` to the
      single-robot side, holds `audioSwell.trigger.global` quiet, and sets `audioSwell.target.robot` to the centre of
      that index's band. `getSeededVal` maps raw −1..1 linearly onto `[0, length)`. Collect the started
      `robotAttribute`.
    - **Company sweep:** the same with a one-robot company, forcing the company side and sweeping
      `audioSwell.company.attribute` across `[0, SWELL_ROBOT_ATTRIBUTE_IDS.length)`.
    - **Assertions, for each path:** no started attribute matches `/\.(phase|pulseWidth)$/`, and the started set equals
      the literal 16 ids (spec §3's order, sorted for comparison).
  - Then the change:
    - the six ids leave `SwellRobotAttributeId` and `SWELL_ROBOT_ATTRIBUTE_IDS` (`src/types/audioSwell.ts`) and
      `ROBOT_SWELL_FIELD_RANGE` (`src/data/audioSwellRanges.ts`; the `Record` type enforces the match);
    - `LAYER_FIELD_PATTERN` becomes `/^layer(\d)\.(gain|detune)$/`;
    - the doc comment on `SwellRobotAttributeId` says "16" and loses the phase and pulse-width justification, with one
      sentence of reason and a pointer to the spec (spec §4: say what it is, not what it was).
  - Existing cases that follow:
    - `audioSwell.test.ts`:
      - the full-membership case loses the six;
      - "has exactly 22" becomes 16;
      - the "includes layer0/1/2.phase" case is deleted;
      - `SWELL_ROBOT_ATTRIBUTE_IDS[16]` (`adsr.release`) becomes index 10;
      - the LFO-target case's title drops "pulseWidth/phase stay swell attributes", and its `toContain('layer0.pulseWidth')`
        becomes `not.toContain`.
    - `audioSwellRanges.test.ts`: the `.phase` and `.pulseWidth` range lines go.
    - `audioSwells.test.ts`:
      - the "first 5 (=cap) picks … layer0.phase reachable" case (line ~789) expects `volume, layer0.gain,
        layer0.detune, adsr.attack, adsr.decay` and is retitled;
      - any other case whose expected *picked attribute* moves because of the index shift is updated and named in the
        commit message. A case that fails for any other reason is a defect, not a shift: stop and report.

  **Proof:** RED test, `src/systems/audioSwells.test.ts`. On today's code, both sweeps start `layerN.phase` and
  `layerN.pulseWidth` swells.

  **Acceptance criteria:**
  - [x] Both robot pickers start only the 16 remaining attributes across a full sweep, for a robot on which all 22 old
        ids would have been live.
  - [x] `SWELL_ROBOT_ATTRIBUTE_IDS` is the 16 ids in spec §3's order, with the five sends last. Case (e) from T1 passes.
  - [x] `npm run build:types` is clean. Any cast the compiler rejects is fixed here and listed as a deviation in the
        commit.

  **Verification:**
  - [x] `npx vitest run src/systems/audioSwells.test.ts src/types/audioSwell.test.ts src/data/audioSwellRanges.test.ts src/systems/robotSendsParity.test.ts`
        passes.
  - [x] Mutation: put `'layer1.phase'` back in the union, the list and the range, and the sweep fails. Revert.
  - [x] Test check: temporarily make the sweep's expected set `SWELL_ROBOT_ATTRIBUTE_IDS`, and on the mutant above it
        passes. That shows the literal is what does the work. Revert. *As run (d8e3fd9f): the sweep also asserts no
        `.phase`/`.pulseWidth` id starts, which alone kills the mutant, so it passes only with that assertion removed too;
        with the literal alone, it fails.*
  - [x] Narrowing `LAYER_FIELD_PATTERN` is tidy-up with no behaviour: once the type cannot name `.phase`, no id
        matches the wider regex. No test can tell the two apart, so its proof is a Read, stated in the commit.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T1, T2, T3.

  **Files:** `src/types/audioSwell.ts`, `src/data/audioSwellRanges.ts`, `src/systems/audioSwells.ts`,
  `src/systems/audioSwells.test.ts`, `src/types/audioSwell.test.ts`, `src/data/audioSwellRanges.test.ts`

  **Estimated scope:** M (three source files with small edits, three test files). This is one task, not two, because
  the type and its consumers must land together to type-check.

- **Task 5: removed** (spec §7 Q1 (b), Crawford 2026-10-26: old saves are not cleaned on load). The number is kept so references stay stable.

### Checkpoint A: The pool
- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite), `npm run build` all clean. Any pre-existing flaky
      test is named, not chased.
- [x] The pool has 16 ids, both pickers are proven by T4's sweep, and no screen asks about a phase or pulse-width swell.
- [x] Every index-shift test update from T4 is listed for Crawford.
- [x] Reviewed with Crawford before 38. *Passed, Crawford 2026-10-26.* T1-T4 are 1ba47a46, 1afa92f4, 37acdddc and
      d8e3fd9f; d8e3fd9f is T7's middle build.

---

### Phase 1b: Backlog 38, timed writes glide (spec §8)

- [x] **Task 10: `src/engine/beatClock.ts`: `getTickSeconds()`, one `16n` at the live tempo**

  **Description:**
  - `TransportLike` gains an optional `toSeconds?(time: string): number`. Tone's Transport has it, so `AudioEngine`'s
    `initBeatClock(transport)` call needs no change: check that this compiles without a cast.
  - `getTickSeconds(): number | undefined` returns `transportInstance.toSeconds('16n')` when the transport has the
    method and the result is a finite positive number, and `undefined` otherwise (no transport, a stub without it, a
    non-finite result).
  - Nothing calls it yet. T11 does.

  **Proof:** RED test in `src/engine/beatClock.test.ts`:
  - a mock transport whose `toSeconds('16n')` returns 0.137 gives 0.137;
  - a mock that returns a different value after a "tempo change" gives the new value, read per call and never cached;
  - no transport, a transport without `toSeconds`, and one returning `NaN`, `0` or a negative number each give
    `undefined`.

  It fails today because the export does not exist.

  **Acceptance criteria:**
  - [x] The getter reads the live value on every call.
  - [x] Every degenerate case returns `undefined`, never a bad number.
  - [x] Existing BeatClock tests pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/beatClock.test.ts` passes.
  - [x] Mutation: cache the first value, and the tempo-change case fails. Return `0` instead of `undefined`, and a
        degenerate case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint A.

  **Files:** `src/engine/beatClock.ts`, `src/engine/beatClock.test.ts`

  **Estimated scope:** XS (one getter, one optional type member)

- [x] **Task 11: the write leaves glide one tick: `setOrPoint` → `setOrGlide`, `rampOrSet`'s timed branch, and their
  callers** *(§8.6 Q6 (b), Q7 (a))*

  **Description:**
  - In `src/engine/audioEngine/voiceEntry.ts`:
    - `setOrPoint` is renamed `setOrGlide`, and its param type becomes `RampableParam`, which includes `rampTo`. With a
      time, a `rampTo` and a tick length from `getTickSeconds()`, it calls `rampTo(value, tick, time)`. With a time but
      no `rampTo` or no tick length, it calls `setValueAtTime(value, time)` when the param has it, which is today's
      point. With no time, it assigns `.value`.
    - `rampOrSet`'s timed branch calls `rampTo(target, tick ?? rampSeconds, time)`. Its untimed branch is unchanged:
      two arguments.
    - Both doc comments say what the leaf does now, with one sentence on why: a per-tick write glides into the next
      tick (spec §8.2). They do not narrate the change.
  - **Callers:** `compositeVoice.ts`'s gain write and `applyOscDetune` (its `osc.detune` type widens to admit `rampTo`),
    and `globalFx.ts`'s EQ bands and both Q writes, call `setOrGlide`.
  - **No caller edit for the rest:** robot volume, the sends and the filter cutoffs already go through `rampOrSet`, so
    its timed branch makes them glide too (Q6 (b), decided). The proof is in the callers' tests: `AudioEngine.test.ts`
    for volume and the sends (one timed `updateRobotMasterVolume` and one `updateRobotSends` reaching `rampTo(…, tick,
    t)`) and `globalFx.test.ts` for a timed LPF/HPF frequency.

  **Proof:** RED tests, written first:
  - `src/engine/audioEngine/voiceEntry.test.ts`: spec §8.4 test 1, with `getTickSeconds` mocked to 0.137 via
    `vi.mock('../beatClock')`. Today's `setOrPoint` describe is renamed. The timed point cases become "glides when the
    param can ramp", and the stub-only case stays a point.
  - `compositeVoice.test.ts` and `globalFx.test.ts`: spec §8.4 test 2, on `rampTo`-shaped stubs.

  The timed cases fail today: they get a point, or `rampSeconds`.

  **Acceptance criteria:**
  - [x] Every timed write through either leaf, on a param that can ramp, is `rampTo(value, tick, time)`.
  - [x] Every untimed call is exactly today's call, and the existing untimed cases pass unmodified.
  - [x] Without a tick length, a timed write is still a point at `time`.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/voiceEntry.test.ts src/engine/audioEngine/compositeVoice.test.ts src/engine/audioEngine/globalFx.test.ts src/engine/AudioEngine.test.ts src/systems/audioSwells.test.ts`
        passes. The last two check that the engine methods and the swell tick are unaffected above the leaf.
  - [x] Mutation, three ways: put back the point in `setOrGlide`'s timed branch; put back `rampSeconds` in `rampOrSet`'s
        timed branch; drop the time from the `rampTo` call. Each fails a test.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T10.

  **Files:** `src/engine/audioEngine/voiceEntry.ts`, `voiceEntry.test.ts`, `compositeVoice.ts`,
  `compositeVoice.test.ts`, `globalFx.ts`, `globalFx.test.ts`, `src/engine/AudioEngine.test.ts` (the volume and sends
  cases only)

  **Estimated scope:** M (two leaves, three one-line caller renames, four test files). It is past the five-file guide,
  but it stays one task because the rename and its callers must land together to type-check. The extra file is tests
  only.

- [x] **Task 12: `src/engine/AudioEngine.ts`: Auto pan glides**

  **Description:**
  - `updateAllPanners(_time?)` becomes `updateAllPanners(time?)`, and the write becomes
    `rampOrSet(entry.panner.pan as unknown as RampableParam, panValue, PAN_RAMP_SECONDS, time)`. With the time from the
    engine's own `16n` loop, this glides one tick (T11).
  - The `PAN_WRITE_EPSILON` skip, `lastPanByRobot`, and the readout store write are unchanged.
  - The comment above the write changes from "Tone's Param value setter is cancelScheduledValues + setValueAtTime" to
    why the skip still matters: each glide is a ramp point plus a ramp.

  **Proof:** RED test, `src/engine/AudioEngine.test.ts`. In the "updateAllPanners write coalescing" cases, the panner
  stub gains a `rampTo` spy:
  - a moving robot's tick calls `rampTo(pan, tick, time)` and never the `value` setter;
  - a move under `PAN_WRITE_EPSILON` writes nothing;
  - the manual-pan cases ("Robot Pan T3/T4") pass unmodified. *As run (0bdf7562): this could not hold. Six T3 cases
    observed Auto's tick write through `.value` on a stub with `rampTo`; only their Auto expectations changed (listed in
    the commit), and "never touches the rampTo of an Auto robot" became a headless `.value` fallback case.*

  It fails today, because the write is `pan.value =`.

  **Acceptance criteria:**
  - [x] Auto pan's per-tick write is a glide at the tick's time.
  - [x] Coalescing and the readout are unchanged.
  - [x] Manual pan and back-to-Auto are unchanged.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] Mutation: drop `time` from the call, so the write is untimed and becomes a 50 ms `rampTo` with two arguments,
        and the case fails. Put back `pan.value =`, and the case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T11.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S (one function, one test group)

### Checkpoint A2: 38's code
- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite), `npm run build` all clean. *As run (0bdf7562): 12274 of
      12275 passed; the one failure was the known `sceneToOrbiterLocal` round-trip 5 s timeout, which passes alone (10/10).*
- [x] Every timed swell write and Auto pan glides one tick, and every untimed write is unchanged, both proven by T11 and
      T12's tests.
- [x] The commit after T4 is noted as T7's middle build: d8e3fd9f. T10–T12 are 2c1bcfd6, 42c094f6 and 0bdf7562.

---

### Phase 2: The runs

- [x] **Task 6: the console check, on the dev server (spec §5.2)**

  **Description:**
  1. **Check first:** does `perf:audio` drive a dev server unchanged (`--url http://localhost:<port>/trace-atlas/`)? Do
     its pin check and its `?debug` overlay reads work there? If not, stop and report before changing the harness. A
     harness change is its own TDD'd task.
  2. **Stock:** a clean `git worktree` of the branch base, on its own port.
  3. **Branch:** the branch's own checkout, `npm run dev` on a second port.
  4. **Prove the metric:** stock first, on S1 (`charlie:200:-30?s=1.q1YqTlOyMjTTUSpOAdK1AA`; Crawford remembers no
     other world, §7 Q3), 120 s. The `console:` line must list `[AudioEngine] Failed to set pulseWidth on composite layer`. If it does not,
     follow spec §7 Q3: one 300 s run, then record the check as unproven, with T4 as the proof.
  5. **Run the branch** on the same world for the same seconds.

  Foreground, one run per call, orphaned Chrome 0 before and after. Record the result in PERFORMANCE.md under a new
  heading beside Task 12. Include the builds (commit, port), the world and the command, and give each run's warning and
  error counts with their distinct first lines.

  **Proof:** the run, recorded.

  **Acceptance criteria:**
  - [x] Stock shows the pulse-width line (the metric is proven), or the unproven fallback is recorded with both run
        lengths. *As run: the fallback. Stock printed nothing in 120 s or 300 s (0 warnings, 0 errors); recorded as
        unproven, T4's test as the proof.*
  - [x] The branch's tally has no pulse-width line and no first line that stock lacks. *Branch, 300 s: 0 warnings,
        0 errors.*

  **Verification:**
  - [x] The PERFORMANCE.md section is read against the raw harness output, every number matching.
  - [x] Orphaned Chrome is checked 0 after the last run.

  **Dependencies:** Checkpoint A2. The branch run is at the head; 38 does not touch the pulse-width path.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** S (runs plus one doc section)

- [x] **Task 7: the measurement, three builds in one session (spec §5.3, §8.5)**

  **Description:**
  - **Builds:** each is built with `npx vite build --minify false --outDir <scratch>` and served with `vite preview` on
    its own port:
    - **stock**: the branch base, from the T6 worktree;
    - **37**: the commit after T4, from a second worktree;
    - **head**: 37 + 38.
  - **Scratch harness:** a copy of `scripts/perf/profile.mjs` in the scratchpad that also saves each window's raw CPU
    profile and its long-task entries. This is Task 12's method; that copy was not kept, so it is rebuilt here and not
    committed. **Prove it** before reading numbers: on stock, its `tickAudioSwells` inclusive share lands in Task 12's
    recorded range (4.13–6.45 %) or the gap is explained.
  - **Runs:** S1 only, `--profile --throttle 4`, nine runs. Three each, interleaved so that no build runs twice in a
    row: stock, 37, head, 37, head, stock, head, stock, 37. Foreground, one per call. Nine runs exceed one tool call's
    limit, so they go over three calls, with the orphan check between.
  - **Read from the IDLE window, per run:**
    - `tickAudioSwells` inclusive;
    - the tick with `updateRobot` excluded;
    - `applyOscFieldViaSet` under the tick, split into Tone's `phase` setter and native `createPeriodicWave`;
    - long tasks in the window, and how many hold tick time.
    - for 38: the robot param writes and the global setters under the tick (Task 12's buckets), which is where a glide
      costs more than a point.
  - **Record** medians and min–max for all three builds in PERFORMANCE.md, beside T6's section.
  - **Name the remaining phase-setter share on the 37 build** as backlog 40's size. Every sample of it comes from
    gain, detune or ADSR writes re-applying an unchanged phase.

  **Proof:** the run, recorded. 37 is not gated (spec §5.3). 38's criterion is that head's tick share stays within 37's
  spread, or the growth is stated as a number (spec §5.6).

  **Acceptance criteria:**
  - [x] Nine runs recorded with the three builds' bundle names, the link and the command.
  - [x] `createPeriodicWave` under the tick is reported for all three builds. The spec expects about 0 on 37 and head,
        and any other result is stated plainly. *As run: 0 on all six branch runs; stock 0 / 0 / 2.84 %.*
  - [x] The 37 build's residual phase-setter share is stated as a number. *0.03 % (0.01–0.04).*
  - [x] Head against 37: the tick share and the param-write buckets, with their spreads, and whether head sits inside
        37's spread. *Outside: tick 2.97 % (2.90–3.07) against 2.16 % (2.14–2.29), +0.81 points; the growth is in
        `setOrGlide` (robot param writes, envelope re-applies, global setters). Crawford's call at Checkpoint B.*

  **Verification:**
  - [x] Every recorded figure is re-read against the saved raw profiles.
  - [x] The scratch harness's stock reading is compared with Task 12, and the comparison is stated. *Stock is
        bimodal on a 6 s window: a live phase swell (run 8, and the discarded shakedown) lands in Task 12's range, none
        reads 2.26–2.41 %; the other buckets match Task 12.*
  - [x] Orphaned Chrome is 0 before and after.

  **Dependencies:** T6. It uses T6's worktree. Its order relative to T6 is only for hygiene: one harness at a time.

  **Files:** `docs/PERFORMANCE.md` (the scratch harness is not committed)

  **Estimated scope:** M (nine runs, analysis, one doc section)

### Phase 2b: T7's follow-up (Crawford, 2026-10-27)

T7 found `getTickSeconds` (Transport `toSeconds('16n')`) running once per write, 0.13–0.22 % of the IDLE window on
head. Crawford asked for it to run once per tick.

- [x] **Task 13: one tick-length read per tick**

  **Description:** `getTickSeconds(time?)`. Given a time, it keeps the last answer for that exact time. Every write in
  one Transport callback shares that callback's `time`, so a tick reads the tempo once, and the next tick, a new time,
  reads it afresh. A tempo change therefore reaches the next tick, not the rest of the current one, so every write in
  a tick glides the same length. With no time it reads live, as today. A bad length is never kept, and
  `initBeatClock`/`resetBeatClock` clear the kept answer. `rampOrSet` and `setOrGlide` pass their `time`.

  **Proof:** RED tests in `beatClock.test.ts`:
  - repeated calls at one time read `toSeconds` once;
  - a new time reads again;
  - a tempo change within a time is not seen, and one at the next time is;
  - a bad length is re-read;
  - a reset clears the kept answer;
  - an untimed call stays live.

  `voiceEntry.test.ts` checks that both leaves pass their write's time.

  **Acceptance criteria:**
  - [x] Every case above passes, and mutating the time comparison, the reset clear or a leaf's argument fails one.
        *Six mutants, all killed. One survived the first pass (an untimed read overwriting the kept length), and a
        case was added for it: an untimed call does not disturb the tick's kept length.*
  - [x] Types, lint and the engine tests pass. *`src/engine`, `src/systems`, `src/stores`: 4000/4000.*

  **Files:** `src/engine/beatClock.ts`, `src/engine/beatClock.test.ts`, `src/engine/audioEngine/voiceEntry.ts`,
  `src/engine/audioEngine/voiceEntry.test.ts`

- [x] **Task 14: the saving, measured**

  **Description:** T7's harness and method, on the same S1 link, two builds: head before T13 (`5459e740`) and after.
  Three runs each, interleaved. Record `getTickSeconds` and `setOrGlide` under the tick, and the tick's inclusive
  share, beside T7's section.

  **Proof:** the run, recorded.

  **Acceptance criteria:**
  - [x] `getTickSeconds` under the tick, before and after, and the tick share with its spreads, stated as numbers.
        *`getTickSeconds` 0.16–0.23 % → 0.00–0.03 %. Tick 2.98 % (2.79–3.08) → 3.04 % (2.87–4.58): the saving is
        below this session's noise (one outlier T13 run, two contaminated first runs), recorded as such.*

### Checkpoint B: Crawford's read and listen
- [x] Crawford reads T6's and T7's sections. *And T14's. Decided (Crawford, 2026-10-27): the glide's cost is
      accepted, about +0.8 points of the IDLE window on head over 37 (T7), less the 0.16–0.23 that T13 removed (T14).*
- [x] Crawford listens on the desktop, stock against head on S1 at Full (spec §5.4). Nothing new is heard, and
      whether pops changed is noted in his words. For 38: a gain or EQ swell over a sustained note glides rather than
      steps, and a swimming robot's pan moves smoothly. A glide that seems to fight a step on the same robot is noted
      as probably backlog 41, not 38. *Crawford, 2026-10-27: "it sounds better. there are still some clicks here and
      there but it's markedly better i think." Nothing new; fewer pops; gain/EQ glides, Auto pan, and no glide fighting
      a step: "sounds fine".*
- [x] Reviewed before docs.

---

### Phase 3: Docs and backlog

- [x] **Task 8: `docs/AUDIO_SYSTEM.md` (and `BEAT_CLOCK.md`): the 16-target robot pool, and timed writes glide**

  **Description:**
  - *(38)* Wherever AUDIO_SYSTEM.md or BEAT_CLOCK.md describes a timed write as "a point at `time`" or
    "`setValueAtTime`" (backlog 35's Scheduling Patterns rule and the Audio Swells paragraph on writes), say instead
    that a write with a time glides one `16n` from `time`, and name `setOrGlide`, `rampOrSet` and `getTickSeconds`.
    Auto pan glides too. Untimed hand edits are unchanged. Find each place with
    `grep -n "setOrPoint\|setValueAtTime\|a point" docs/AUDIO_SYSTEM.md docs/BEAT_CLOCK.md`.
  - In Audio Swells, rewrite the **Robot pool** bullet:
    - 16 attributes;
    - each layer's `gain` and `detune` (six fields);
    - the four ADSR fields and the five sends, last;
    - why phase and pulse width are not targets, in one or two sentences: settings, not params; phase rebuilds a
      periodic wave per write; pulse width is read by pulse oscillators only and is never seeded. Link the spec and
      backlog 37.
  - Remove the sentence that says `volume`, every `pulseWidth` and every `phase` "stay swell-eligible".
  - *(§7 Q5, decided)* In "Three master controls", `SWELL_FREQUENCY_SCHEMA`'s range reads `[0, 16]`
    (`SWELL_FREQUENCY_STEPS`' last entry). The "values above 16 are clamped" sentence then describes a value the slider
    cannot reach: keep it as the `frequencyToPerTickChance` contract, or drop it, and say which in the commit.
  - Spot-check every named identifier against the shipped source.

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [x] Every id, count and function name in the edited paragraphs matches the source at the head.
  - [x] No sentence elsewhere in AUDIO_SYSTEM.md still calls phase or pulse width a swell target.
  - [x] No sentence in either doc still says a timed write is a point, and none mentions `setOrPoint`. *The two
        remaining "point" sentences describe the no-tick-length fallback (headless and tests), which is accurate.*

  **Verification:**
  - [x] Manual read and both greps (`phase\|pulseWidth`; `setOrPoint\|setValueAtTime\|a point`), each hit read in
        context.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint B.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/BEAT_CLOCK.md` (only if it says "point")

  **Estimated scope:** XS (docs only)

- [x] **Task 9: `docs/todo/backlog.md`: Built lines, and 40's number**

  **Description:**
  - Under 37, add a **Built** line: branch, commits, T6's and T7's results in one sentence each with a link to the
    PERFORMANCE.md sections, and Crawford's listen.
  - Under 38, add a **Built** line: folded into 37's branch, T10–T12's commits, which writes glide (§8.6 Q6's answer),
    T7's head-against-37 numbers, and Crawford's listen.
  - Under 36, add a line that it closes with 37's branch, plus one correction: the flood is `devWarn`, dev builds only,
    not "dev and production" as its Found line says.
  - Under 40, fill in its first "To check first" bullet with T7's residual phase-setter share, with a link. 40's Fix
    stays undecided.
  - At merge (Crawford's PR, not this task): 36, 37 and 38 move to the archive in the usual way, and the 37 and 38
    plan.md lines are deleted.

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [x] 36, 37 and 38 each say what shipped and where the proof is recorded.
  - [x] 40 carries T7's number and still decides nothing (cut-cruft rule: Crawford decides).
  - [x] Every link and anchor resolves.

  **Verification:**
  - [x] Manual read. Anchors checked against their headings.

  **Dependencies:** T8.

  **Files:** `docs/todo/backlog.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every task's acceptance criteria are met, and any not met are stated with the reason.
- [ ] AUDIO_SYSTEM.md matches the shipped pool and the glide rule.
- [ ] Crawford's listen (Checkpoint B) is recorded in backlog 37's and 38's Built lines.
- [ ] Ready for Crawford's PR, which closes 36, 37 and 38. Next in plan.md: backlog 40 and 41.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The index shift moves expectations in existing `audioSwells.test.ts` cases beyond the one named, and a real defect hides among the "shift" updates | Medium | T4 updates only assertions about *which attribute was picked*, names every one in the commit, and stops on any other kind of failure. Checkpoint A lists them for Crawford. |
| The RED sweep passes trivially because its expected set is derived from the list | High | Architecture Decision: assert a literal 16-id array plus the regex. T4's test check shows the derived form passes on a mutant, so the literal is what does the work. |
| The union shrinks before a template-string consumer is gone, and types break mid-branch | Medium | T2 and T3 remove the two consumers whose types the compiler checks, before T4. T4's acceptance requires `build:types` clean, with any surprise cast fixed there and recorded. |
| Parity case (e) is narrowed in a way that no longer catches a send-order regression | Medium | T1's mutation (swap two sends, or move one ahead of the ADSR) must fail it. |
| T6's console check proves nothing: production builds cannot print `devWarn`, and stock may not hit a pulse-width swell in 120 s | Medium | Run on `npm run dev`, prove the line on stock first, then follow spec §7 Q3's fallback (300 s, then recorded as unproven) rather than claim absence. |
| `perf:audio` does not work against a dev server (HMR client, unbundled modules, the pin check) | Low | T6's first step checks it and stops to report. A harness change becomes its own TDD'd task, not an edit in passing. |
| T7's numbers drift from Task 12's, or the rebuilt scratch harness measures differently | Medium | Same-session A/B, interleaved. T7 proves the scratch harness against Task 12's stock range before reading the branch. |
| The residual phase-setter share on the branch is read as 37 failing | Low | Spec §5.3 and T7 name it in advance as backlog 40's size. Not gated. |
| A glide's `setRampPoint` (a value read, a cancel-and-hold and a point, plus the ramp) costs more per write than a point, and the tick grows | Medium | T7's head-against-37 comparison, on the param-write buckets specifically. A growth beyond 37's spread is reported with its number for Crawford, not tuned away. |
| A hand edit or a manual-pan switch lands while a glide is in flight | Low | Hand edits cancel their field's swell first, and `.value =` cancels scheduled values from now. Manual pan's untimed `rampTo` cancels and holds at now. T12 keeps the manual-pan cases unmodified, and T11 keeps the untimed cases unmodified. |
| A glide reaches its value one tick late, so the exact return to base lands a sixteenth later than before | Low | Accepted in spec §8.2 (a sweep shifted by a sixteenth cannot be heard; the no-lag alternative jumps at a swell's first tick). The existing return-to-base tests assert the store value, which is unchanged. |
| A glide seems to fight a step on one robot at the listen | Low | That is backlog 41's stale envelope patch (an ADSR swell tick re-applies the build-time gain, which now also glides). Noted at Checkpoint B against 41, not fixed here. |
| Tone exponentially ramps decibel and frequency params, and `setRampPoint` swaps a 0 for `minOutput` | Low | That is the same `rampTo` volume and the sends already use. Linear for gain, cents, Q and pan. Covered by the listen. |

## Open Questions

All five from spec §7 and both from spec §8.6 are **resolved** (Crawford, 2026-10-26), and the Architecture Decisions
record each.

1. **Clean old saves on load?** **Resolved: (b), no.** T5 is removed.
2. **Parity case (e).** **Resolved: (a).** T1 narrows it.
3. **The console check's world.** **Resolved:** none remembered, so S1 and the fallback (T6).
4. **The two findings.** **Resolved:** recorded now as backlog 40 and 41 (T0) and placed next in plan.md after this
   branch. They get their own spec or interview when picked up, not tasks here.
5. **The `[0, 24]` doc error.** **Resolved:** fixed in T8.
6. **Which timed writes glide?** **Resolved: (b).** Every timed write, robot volume, the sends and the filter cutoffs
   included (T11).
7. **The glide length.** **Resolved: (a).** One 16th note at the live tempo (T10).
