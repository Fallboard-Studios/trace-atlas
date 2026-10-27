# Implementation Plan: Phase and Pulse Width Come Off the Swell Targets

Spec: [docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md](../specs/SWELL_PHASE_PULSE_WIDTH_CUT.md). Backlog slot:
[37](../todo/backlog.md#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick), the first line of plan.md's Stage 1.
It closes [36](../todo/backlog.md#36-audio-swells-on-pulsewidth-write-nan-into-the-voice-every-tick). There is no intent
file: Crawford decided this on 2026-10-26 with no interview. Build branch: `fix/swell-targets` off `main` (`959a989b` or
later). Backlog 38 follows on the same branch under its own spec and plan.

**Spec §7 is resolved** (Crawford, 2026-10-26). The Architecture Decisions record each answer:

- Q1 (b): old saves are left alone, so T5, the load guard, is removed.
- Q2 (a): parity case (e) narrows.
- Q3: S1 and the fallback.
- Q4: the findings are backlog 40 and 41, next in plan.md after 37.
- Q5: the doc range is fixed.

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
references stay stable. Two runs follow: the console check (T6) and the before/after measurement (T7). Crawford listens
at Checkpoint B. Docs (T8) and the backlog (T9) close it.

Each task names its **Proof** (TASK_TEMPLATE.md):

- a RED test for the two that change behaviour (T2, T4);
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
  sit next in plan.md after 37. T9 adds T7's residual number to 40.
- **Resolves spec §7 question 5: the `[0, 24]` doc error is fixed in T8**, beside the paragraph T8 already edits.

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
      Checkpoint A (full suite, types, lint, build; Crawford reviews)
            │
T6 (console check on dev: stock shows the line, branch does not; recorded)
            │
T7 (same-session A/B, S1, 3 + 3 runs; recorded)
            │
      Checkpoint B (Crawford reads T6/T7 and listens, stock against branch)
            │
T8 (AUDIO_SYSTEM.md: the 16-target pool; [0, 24] → 16)
            │
T9 (backlog: Built lines on 36 and 37; T7's number under 40)
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

- [ ] **Task 1: `src/systems/robotSendsParity.test.ts`: case (e) narrows to the sends tail** *(§7 Q2 (a))*

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
  - [ ] Case (e) passes on today's 22-id list.
  - [ ] Every recording constant is byte-identical. `git diff` shows only case (e), `SWELL_POOL`, the self-check list
        and the header sentence.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSendsParity.test.ts` passes.
  - [ ] Mutation: swap two sends in `ROBOT_SEND_FIELDS`' order, or move `reverbSend` ahead of `adsr.release` in the
        list, and case (e) fails. Then revert.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/systems/robotSendsParity.test.ts`

  **Estimated scope:** XS (one test case)

- [ ] **Task 2: the layer swelling flags drop `phase` and `pulseWidth`**

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
  - [ ] The hook returns exactly `gain` and `detune` for each layer index, and `undefined` without a robot (existing
        case, unchanged).
  - [ ] The robot screen and the company options still forward a layer's gain and detune flags to their sliders.
        Existing tests pass unmodified apart from the hook case above.
  - [ ] `isRobotAttributeSwelling` is never asked about a `.phase` or `.pulseWidth` id from either screen.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/useSwellingFlags.test.ts src/components/robot/SignatureArrayDrawer.test.tsx src/components/company/useCompanyOptions.test.ts`
        passes.
  - [ ] Mutation: put `phase` back in the hook's object, and the case fails.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/components/robot/useSwellingFlags.ts`, `src/components/robot/useSwellingFlags.test.ts`,
  `src/components/company/useCompanyOptions.ts`, `src/components/robot/SignatureArrayDrawer.tsx`

  **Estimated scope:** S (four files, all removals plus one expectation)

- [ ] **Task 3: `src/utils/sessionDiff.ts`: the phase and pulse-width base lookups go**

  **Description:**
  - In `computeRobotAudioOverrideDiff`, `layersToCapture` reads `phase: layer.phase` and `pulseWidth: layer.pulseWidth`
    directly, the same as `baselineLayersNormalized` beside it.
  - The two `extractSwellBaseValueIfActive(…, \`layer${layerIndex}.phase|pulseWidth\` as SwellRobotAttributeId)` calls
    go. The gain and detune lookups stay.
  - Until T4, a save made during a phase swell captures the interpolated phase. That is accepted for the commits in
    between.

  **Proof:** Read. A deletion, by CLAUDE.md. Existing sessionDiff tests are the parity check.

  **Acceptance criteria:**
  - [ ] Only the two lookup expressions change.
  - [ ] Every existing case in `sessionDiff.test.ts` passes unmodified, including "with a swell in flight".

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionDiff.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/utils/sessionDiff.ts`

  **Estimated scope:** XS (two expressions)

- [ ] **Task 4: the robot swell pool drops the six ids**

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
  - [ ] Both robot pickers start only the 16 remaining attributes across a full sweep, for a robot on which all 22 old
        ids would have been live.
  - [ ] `SWELL_ROBOT_ATTRIBUTE_IDS` is the 16 ids in spec §3's order, with the five sends last. Case (e) from T1 passes.
  - [ ] `npm run build:types` is clean. Any cast the compiler rejects is fixed here and listed as a deviation in the
        commit.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts src/types/audioSwell.test.ts src/data/audioSwellRanges.test.ts src/systems/robotSendsParity.test.ts`
        passes.
  - [ ] Mutation: put `'layer1.phase'` back in the union, the list and the range, and the sweep fails. Revert.
  - [ ] Test check: temporarily make the sweep's expected set `SWELL_ROBOT_ATTRIBUTE_IDS`, and on the mutant above it
        passes. That shows the literal is what does the work. Revert.
  - [ ] Narrowing `LAYER_FIELD_PATTERN` is tidy-up with no behaviour: once the type cannot name `.phase`, no id
        matches the wider regex. No test can tell the two apart, so its proof is a Read, stated in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T1, T2, T3.

  **Files:** `src/types/audioSwell.ts`, `src/data/audioSwellRanges.ts`, `src/systems/audioSwells.ts`,
  `src/systems/audioSwells.test.ts`, `src/types/audioSwell.test.ts`, `src/data/audioSwellRanges.test.ts`

  **Estimated scope:** M (three source files with small edits, three test files). This is one task, not two, because
  the type and its consumers must land together to type-check.

- **Task 5: removed** (spec §7 Q1 (b), Crawford 2026-10-26: old saves are not cleaned on load). The number is kept so references stay stable.

### Checkpoint A: The pool
- [ ] `npm run build:types`, `npm run lint`, `npm test` (full suite), `npm run build` all clean. Any pre-existing flaky
      test is named, not chased.
- [ ] The pool has 16 ids, both pickers are proven by T4's sweep, and no screen asks about a phase or pulse-width swell.
- [ ] Every index-shift test update from T4 is listed for Crawford.
- [ ] Reviewed with Crawford before the runs.

---

### Phase 2: The runs

- [ ] **Task 6: the console check, on the dev server (spec §5.2)**

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
  - [ ] Stock shows the pulse-width line (the metric is proven), or the unproven fallback is recorded with both run
        lengths.
  - [ ] The branch's tally has no pulse-width line and no first line that stock lacks.

  **Verification:**
  - [ ] The PERFORMANCE.md section is read against the raw harness output, every number matching.
  - [ ] Orphaned Chrome is checked 0 after the last run.

  **Dependencies:** Checkpoint A.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** S (runs plus one doc section)

- [ ] **Task 7: the before/after measurement, a same-session A/B (spec §5.3)**

  **Description:**
  - **Builds:** stock (the branch base, from the T6 worktree) and the branch, each with `npx vite build --minify false
    --outDir <scratch>`, served with `vite preview` on their own ports.
  - **Scratch harness:** a copy of `scripts/perf/profile.mjs` in the scratchpad that also saves each window's raw CPU
    profile and its long-task entries. This is Task 12's method; that copy was not kept, so it is rebuilt here and not
    committed. **Prove it** before reading numbers: on stock, its `tickAudioSwells` inclusive share lands in Task 12's
    recorded range (4.13–6.45 %) or the gap is explained.
  - **Runs:** S1 only, `--profile --throttle 4`, six runs interleaved stock, branch, branch, stock, stock, branch.
    Foreground, one per call.
  - **Read from the IDLE window, per run:**
    - `tickAudioSwells` inclusive;
    - the tick with `updateRobot` excluded;
    - `applyOscFieldViaSet` under the tick, split into Tone's `phase` setter and native `createPeriodicWave`;
    - long tasks in the window, and how many hold tick time.
  - **Record** medians and min–max for both builds in PERFORMANCE.md, beside T6's section.
  - **Name the remaining phase-setter share on the branch** as backlog 40's size. Every sample of it comes from
    gain, detune or ADSR writes re-applying an unchanged phase.

  **Proof:** the run, recorded. Not gated (spec §5.3).

  **Acceptance criteria:**
  - [ ] Six runs recorded with both builds' bundle names, the link and the command.
  - [ ] `createPeriodicWave` under the tick is reported for both builds. The spec expects about 0 on the branch, and
        any other result is stated plainly.
  - [ ] The branch's residual phase-setter share is stated as a number.

  **Verification:**
  - [ ] Every recorded figure is re-read against the saved raw profiles.
  - [ ] The scratch harness's stock reading is compared with Task 12, and the comparison is stated.
  - [ ] Orphaned Chrome is 0 before and after.

  **Dependencies:** T6. It uses T6's worktree. Its order relative to T6 is only for hygiene: one harness at a time.

  **Files:** `docs/PERFORMANCE.md` (the scratch harness is not committed)

  **Estimated scope:** M (six runs, analysis, one doc section)

### Checkpoint B: Crawford's read and listen
- [ ] Crawford reads T6's and T7's sections.
- [ ] Crawford listens on the desktop, stock against branch on S1 at Full (spec §5.4). Nothing new is heard. Gain and
      detune still step, which is backlog 38. Whether pops changed is noted in his words.
- [ ] Reviewed before docs.

---

### Phase 3: Docs and backlog

- [ ] **Task 8: `docs/AUDIO_SYSTEM.md`: the 16-target robot pool**

  **Description:**
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
  - [ ] Every id, count and function name in the edited paragraphs matches the source at T4's commit or later.
  - [ ] No sentence elsewhere in AUDIO_SYSTEM.md still calls phase or pulse width a swell target.

  **Verification:**
  - [ ] Manual read and `grep -n "phase\|pulseWidth" docs/AUDIO_SYSTEM.md`, each hit read in context.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint B.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

- [ ] **Task 9: `docs/todo/backlog.md`: Built lines, and 40's number**

  **Description:**
  - Under 37, add a **Built** line: branch, commits, T6's and T7's results in one sentence each with a link to the
    PERFORMANCE.md sections, and Crawford's listen.
  - Under 36, add a line that it closes with 37's branch, plus one correction: the flood is `devWarn`, dev builds only,
    not "dev and production" as its Found line says.
  - Under 40, fill in its first "To check first" bullet with T7's residual phase-setter share, with a link. 40's Fix
    stays undecided.
  - At merge (Crawford's PR, not this task): 36 and 37 move to the archive in the usual way, and 37's plan.md line is
    deleted.

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [ ] 36 and 37 each say what shipped and where the proof is recorded.
  - [ ] 40 carries T7's number and still decides nothing (cut-cruft rule: Crawford decides).
  - [ ] Every link and anchor resolves.

  **Verification:**
  - [ ] Manual read. Anchors checked against their headings.

  **Dependencies:** T8.

  **Files:** `docs/todo/backlog.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every task's acceptance criteria are met, and any not met are stated with the reason.
- [ ] AUDIO_SYSTEM.md matches the shipped pool.
- [ ] Crawford's listen (Checkpoint B) is recorded in backlog 37's Built line.
- [ ] Ready for Crawford's PR. Next in plan.md: backlog 40 and 41, then 38.

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

## Open Questions

All five from spec §7 are **resolved** (Crawford, 2026-10-26), and the Architecture Decisions record each.

1. **Clean old saves on load?** **Resolved: (b), no.** T5 is removed.
2. **Parity case (e).** **Resolved: (a).** T1 narrows it.
3. **The console check's world.** **Resolved:** none remembered, so S1 and the fallback (T6).
4. **The two findings.** **Resolved:** recorded now as backlog 40 and 41 (T0) and placed next in plan.md after 37. They
   get their own spec or interview when picked up, not tasks here.
5. **The `[0, 24]` doc error.** **Resolved:** fixed in T8.
