# Follow-ups: The Off Screen code review

> **Status (2026-10-31):** Phase A built (R1 `608f2b85`; R2 `0208992f` and `5c5264de`) and Checkpoint A passed,
> including Crawford's Look and listen ("everything looks and sounds good"). Outside this plan, the flaky `audioSwells`
> ramp case was removed (`9fdfe5bb`), so the suite counts one test fewer. **Phase B is built**, each task with an "As
> shipped" note: R4 `60ab94ab`, R14 `b736da43`, R33 `d336b76c`, R3 `e7c6d5fc`, R5 `34df752f`, R6 `628704e8`,
> R7 `1668550f`, R8 `dcd94e0f`, R9 `3181c858`. Checkpoint B passed, including Crawford's Look (2026-10-31).
> **Phase C is built:** R10 `b8986433`, R11 `0cfc0401`, each with an "As shipped" note, and
> Checkpoint C's automated half is done; Crawford's Reads there are still open. **Phase D is built** (2026-10-31),
> each task with an "As shipped" note: R12 `cc9dd74e`, R13 `d2024ea6`, R15 `a338371b`, R16 `5e94f48b`,
> R17 `f4347e56`, R18 `ba705262`, R19 `1e1823f1`, R20 `66f5d85d`, R21 `ec390c40`, R22 `11ab2303`, R23 `ff9848d3`,
> R24 `4ac9633f`, R25 `fda61552`, R26 (`5da0ce43`, `8d1f2ae1`, `17f98363`, `0929d592`), R27 `0765c0c7`.
> Checkpoint D's automated half is done. **Phase E is built** (2026-11-01), each task with an "As shipped" note:
> R28 `1ee0c840`, R29 `731999dd`, R30 (`e66fda8f`, `65225db5`, `5277381a`, `73312979`), R31 (`6f82ea0e`,
> `d4f158fc`, `73ee8473`, `fd09e595`, `64484605`), R32 `92c67ba2`. Checkpoint: Complete's first box is ticked.
> Crawford's review (2026-11-01) passed the Reads (Checkpoint C, R28, R32) and answered Checkpoint D's list.
> **Next:** [OFF_SCREEN_FINAL_FIXES.md](OFF_SCREEN_FINAL_FIXES.md) holds his answers as tasks F1–F10. It includes this
> plan's probes and parity dump (F10), and the PR waits on its Checkpoint: Complete.
> The review's verdict on
> `feature/off-screen` at `b148c1e8` was **request changes**: one Critical and eight Required findings, then Consider
> items and nits. Every finding is here as a task. **Crawford answered the open questions the same day** (Open
> Questions, below):
> - A replaced world's decoration moves behind the veil.
> - An aspect change stops rebuilding the world (new task R33).
> - The melody accents are fixed here.
> - A theme change keeps the hour.
> - The chooser focuses its selected row.
> - Keep is relabelled "Save Last World".
> - All of Phase D is built.
> - Every removal in R31 and the `CLAUDE.md` edits in R32 go ahead: "if we don't need something, let's get rid of it".
>
> Nothing in this plan waits on him now. Crawford's open items from the two plans (Task 11's listen, the Looks, the
> Pixel A/B, the PR) are not tasks here; this plan runs before the PR.

Source plans: [docs/tasks/OFF_SCREEN.md](OFF_SCREEN.md) (Tasks 0–38) and
[docs/tasks/OFF_SCREEN_REVISIONS.md](OFF_SCREEN_REVISIONS.md) (Tasks 1–14; Task 11 open). Source spec:
[docs/specs/OFF_SCREEN.md](../specs/OFF_SCREEN.md). Roadmap
[57](../todo/roadmap.md#57-the-off-screen-power-as-pause-the-two-axis-chooser-keep-and-the-band-table). Written from a
five-axis review of `feature/off-screen` at `b148c1e8` against `main` at `cc9a01f2` (72 commits, 143 files,
+14,422 / −1,783). No new spec is needed: the Critical brings the code back to the spec's own §1.2, and the rest are
fixes, tests and cleanups. Crawford's answers (Open Questions) added one design change, R33, which R11 writes into the
spec.

Written for: Crawford, and a fresh agent session picking this up cold. Task ids are `R1…R33` so they never collide with
the two plans' Task numbers. R33 was added after Crawford's answers and is built in Phase B, before R3; R14 moved up
into Phase B with it. Build in the order the phases list the tasks. Commit subjects: `off-screen-review R<n>: <what>`.
Line numbers are at `b148c1e8` and may drift.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`. Browser probes:
see "How the findings were proven", below.

## What the review checked (so it is not redone)

- **Verification story:** types clean, lint 0 errors (the 4 old warnings), `npm test` 344 files / 13,017 tests and
  `npm run build` were recorded green at `b148c1e8` by the build session (the plan's Checkpoint: Complete). The review
  changed no code, so it did not rerun them.
- **Classic parity holds byte for byte.** A scratch test dumped `generateRobotRosterBaseline` (40 robots),
  `generateCompanyRosterBaseline`, `generateGlobalAudioSettings` and `generateAttenuationStyleBpm` for 12 seeds in a
  worktree at `cc9a01f2` and one at `b148c1e8`: identical files. The 480 robots included 62 with a shaped stage, 9 with
  the bandpass accent and all five waveforms.
- **No new runtime import cycle.** The one cycle (`AudioEngine` ↔ `lfoEngine` ↔ `localeStore`) is on `main` too.
- **Guardrails:** no timer for musical timing, no Tone synth in a component, no timeline or ref in a store, no test that
  reads source, CSS or docs, no skipped or focused test; the content layer is clean.
- **Security:** `theme` and the four family params are allow-listed, `x` / `y` are digit-only, the blob keeps its size
  cap and shape check, no object key comes from input, nothing renders HTML, `replaceState` gets same-origin values, and
  every `localStorage` read is guarded.
- **The wash's state machine:** no interleaving was found that leaves it stuck, runs a change twice, or runs one against
  an unmounted world.
- **Bundle:** JS 1,280.02 → 1,301.57 kB (gzip 394.15 → 400.75 kB, +1.7 %), CSS 62.63 → 65.32 kB.
- **Mutation:** 19 mutants on the first plan's gates. 12 died: pause from any state, never marking the device, a second
  work-loop pause restarting the span, a second pause forgetting the first, Keep not trimming, detach renaming a
  hand-named session, a vanished save reading clean, no seeded rotation, members dealt again as freelancers, a later
  family overwriting an earlier one, an unknown link theme kept, Classic written on every link. Seven lived; two of
  those are equivalent (a kill leaving the world mark; a work-loop restart keeping the old pause). The other five are
  in R27. Four more on the link and the address-bar mirror lived (R9); two sanity mutants on the same files died.

## How the findings were proven (reuse these)

- **Browser probes.** A dev server from the branch on a free port (never 5173 or 5174; those are Crawford's), headless
  Chrome through `scripts/perf/cdp-lib.mjs`'s `withChrome`, the heard-world flag set before load
  (`trace-atlas.device.v1` = `{"heardWorld":true}`), real mouse clicks found by `aria-label` ("Power on", "Power off",
  "Roll", a preset's name), real keys through `Input.dispatchKeyEvent`, and page-side reads through
  `import('/trace-atlas/src/...')`. Restart the server after any source edit or mutation run: otherwise the page-side
  import reads a fresh module copy and the stores look empty. A server in a git worktree whose `node_modules` is a
  junction shares `node_modules/.vite` with Crawford's servers and rebuilds that cache. The five measurements at
  `b148c1e8`, against `?seed=kr1nd4ra&x=12&y=68` at 1600 × 900:
  1. **Frozen decoration.** On, off, pick Vessport Null, on: **64 of 94** `'world'` timelines paused while the tablet
     is on (all 12 `orbiter-size-world-*`, all 48 `flicker-world-*`, all 3 `halo-waves-world-*`, one bubble stream).
     Fresh page then on: 0 of 91. On, off, on: 0 of 91. A fresh page before any power-on: all 78 decorative timelines
     play.
  2. **The LFO bank.** On, off, Roll, on: `lfoEngine.getBankSettings(lane)` against `useAudioStore.getState().lfoBank[lane]`
     differs on all four lanes (the old world's drifts and free rates against the new world's synced lanes). Only lane
     b's rate followed the new tempo, because it was synced in the old world too.
  3. **The clock.** On for 25 s, off: `getCurrentMeasurePrecise()` 4.25. Roll, on, 6 s later: **5.88**. The same world
     fresh, 6 s after on: 0.88. A rerun also reads the measure right at power-on (0 after a restart) and the BPM, then
     compares 6 s against seconds × BPM / 240. A fixed bound like "under 1.5" depends on the rolled tempo: at 84 BPM a
     correct restart reads 2.125.
  4. **Lost toggle.** Hypnotic then Wandering, 150 ms apart: the loading store holds `{ melody: ['wandering'] }`, only
     Wandering is pressed, the bar mirrors `melody=wandering`. After R33 the expectation is both picks, with no wash
     raised at all.
  5. **Keyboard loop.** Pick Vessport Null, focus Keep, Shift+Tab six times: Vessport Null, Roll, Vessport Null, Roll…
- **Unit experiments** (a scratch test in a worktree, not committed): with the wash attached, two toggles before the
  cover lands keep only the second; Melody then Envelope loses Melody; a theme pick then a toggle leaves Classic; a
  preset then Current still applies the preset. With `voice: ['glassy']` loaded, every `reReserveVoice` call during a
  coordinates retransmit and during a loading-only retransmit (12 of 12 each) found no robot in the active locale.
- **The parity dump** for R27's fixture: the test above, written into `src/` of a worktree at each commit, run with
  `npx vitest run`, its JSON compared with `cmp`.

## Overview

Five phases:
- **Phase A, the cold world (R1–R2):** a world replaced while the tablet is paused is torn down the way the spec's §1.2
  already says, so the next power-on is a real start; and the LFO bank follows the store whenever it exists, not only
  while the context runs.
- **Phase B, the Required fixes (R4, R14, R33, R3, R5–R9, in that order):**
  - the deal's Voice change reaches the engine during a rebuild, and its engine push becomes exhaustive and guarded;
  - an aspect change re-deals the live roster in place, with no rebuild and no wash;
  - the off screen keeps every click made while a theme or world change waits under the wash;
  - spawn's melody accents reach the engine during a rebuild;
  - Keep never overwrites another save;
  - Foundry's Retransmit detaches the loaded save;
  - Roll leaves the radio group's roving focus;
  - the link and mirror tests cover all four families and awkward names.
- **Phase C, docs (R10–R11):** the deleted constants and the spec's stale claims.
- **Phase D, Consider (R12–R27, less R14):** structure, robustness, UX, five verify-first items and the test gaps.
  Crawford wants all of it built.
- **Phase E, nits (R28–R32):** comments, small hardening, the removals Crawford approved, and doc nits.

## Architecture Decisions

- **A paused world that a world change replaces is torn down first, as spec §1.2 says (R1).** The spec reads "a world
  change while `'paused'` … goes through today's teardown (`stopWorkLoop`, `killAll` → `resetBeatClock`) and leaves
  `'cold'`"; the build never did it, because `AudioEngine.start()` returns early once initialised
  (`AudioEngine.ts:672`) and nothing calls `killAll`. So `retransmitWorld` gains one check after its no-op return:
  when `getWorldState() === 'paused'` and the action rebuilds the locale (`loadingOnly`, `coordsOnly`, `both`, or
  `attenuationStyleOnly` with a loading), it calls a new `tearDownPausedWorld()` first. That function sits in
  `worldTransition.ts` beside `startLocaleSystems`, as its stop half: `stopRobotLifecycle()`, `stopWorkLoop()`,
  `stopAudioSwells()`, `AudioEngine.killAll()`, then `resumeWorldTimelines()` to end the pause span. It runs before
  `removeLocale`, while the old world still exists, as `shutdown()` did on `main`.
  - **Why at the world change, not at power-on:** two of the five symptoms show while the tablet is still off. The old
    world's frozen swells feed Keep and the dirty read (`sessionDiff.ts:163-205`, `:224-226`), and the old work loop's
    `run` makes the new robots skip the hide-at-station path (`workLoop.ts:870`).
  - **Why `killAll` is safe:** it cancels and rewinds the transport, clears the step counter and `initialized`, and
    resets the BeatClock. It disposes nothing, and `main` ran `killAll` + `start` on every power cycle. After it, the
    next flip's `start()` is a full start: transport and BeatClock from 0, every voice re-registered by
    `reRegisterAllRobotsAudio`, and every global link re-linked from the store.
  - **Ending the pause span there** makes a replaced world exactly like a fresh page's cold world: its bubbles, flicker
    and orbiters play behind the veil (probe 1: a fresh page plays all 78 before any power-on). Crawford chose this
    over keeping it frozen until power-on (Open Question 1).
  - **Unchanged:**
    - a live retransmit (tablet on), which stays `'running'`;
    - the Attenuation-Style-only retransmit, which rebuilds nothing, stays `'paused'` and is unreachable from the off
      screen;
    - R33's aspect-only change, which rebuilds nothing either, so a family change while paused stays paused.
- **The LFO bank follows the store whenever it is primed (R2).** `lfoEngine.primeLfoBank` runs once
  (`lfoEngine.ts:232`, `if (primed) return;`), so even a full start does not re-prime the lanes. The pushes that keep
  the engine in step are gated on `isAudioContextRunning()`, which is false for the whole pause: `audioStore.ts:755`
  and `sessionDiff.ts:553` / `:561`. The loading-only path's `regenerateGlobalHalfFromSeed` (`worldTransition.ts:232-238`)
  has no push at all. Gate on a new `lfoEngine.isBankPrimed()` instead, and give that path the same push. Before the
  first start the bank is unprimed and every write stays data-only, as now. While paused, a write reaches the
  suspended nodes, which is what Tone allows.
- **An aspect change re-deals the live roster in place, with no rebuild and no wash (R33).** Crawford, 2026-10-31:
  "should we only refresh the world when necessary … probably not on every aspect change". A family row moves only
  robot-side keys; aspects never reach the global half (spec §3).
  - **What it costs today:** the change goes through `loadingOnly`. The whole global half is regenerated from seed and
    the locale is rebuilt (about 440 ms of main thread), all under a one-second wash.
  - **What changes:** `resolveRetransmitAction` gets an `aspectsOnly` mode (no name, no plot, the theme unchanged).
    `retransmitWorld` handles it by writing the loading store, re-dealing over the live roster and mirroring the URL.
  - **The re-deal** re-derives, per robot, only the families whose dealt aspect changed. A family no longer dealt goes
    back to the theme's own draw, through the same derive function spawn uses. Each change reaches the engine through
    the call a hand edit makes.
  - **What stays:** positions, batteries, jobs, the global half, and tweaks on other fields. A tweak on a re-derived
    field resets, as any re-derivation does; the spec's "the tweaks go" for a family change is amended in R11.
  - **Power state:** the world keeps it. A family change while paused stays paused and resumes on the next flip.
  - **A theme change keeps the rebuild** under the wash: it moves the tempo, the Low-Pass and every robot's theme bands.
    An in-place theme change is possible later; it is not in this plan.
- **The off screen holds the click's intent while a world change is pending (R3).** Theme picks, world picks and Roll
  still wait under the wash, and `requestWorldChange` keeps only the newest request (`worldChange.ts:64`). So a click
  inside the half-second cover replaces the one before it, built from rows that have not caught up.
  - While a change is pending, the screen keeps the intended pick and loading, set at each click. An aspect toggle
    made then joins the intent instead of re-dealing a world that is about to change.
  - Every request realises the whole intent: the pending pick, then the loading if it differs from the pick's own. That
    matches two clicks without the wash: apply, then a loading retransmit, which drops the pick's tweaks as a theme pick
    always has. "Last request wins" stays, and each request now carries everything.
  - Picking Current while a pick is pending cancels it through a new `cancelWorldChange()`.
  - Keep dims while a change is pending, because it would save the world the rows no longer show (the dim-controls
    rule).
  - The rows, description lines and readout draw from the intent, so a pick shows at the click. Crawford's answer to
    Open Question 2 was "whatever's more performant". The two cost the same: one render of the screen per click,
    against a 0.5 s fade and a 440 ms rebuild. Drawing from the intent is also what the Current-cancels case needs,
    because Radix's radio group reports no click on the row it already shows as selected. The real performance answer
    is R33.
- **During a rebuild, engine lookups take the robot explicitly (R4, R5).** Every rebuild builds the new locale under a
  fresh UUID and makes it current only afterwards (`worldTransition.ts:218-223`, `:351-359`). So
  `findActiveRobot` (`AudioEngine.ts:275`) misses every new robot during `initializeLocale`.
  - `reReserveVoice` (`:1021`) then returns false, and the deal's Voice push does nothing.
  - `registerRobotMelody` (`:1309`) then registers with no motif accents and no click track.
  - Both gain an optional `robot` argument, used before the lookup; the deal (`spawnSystem.ts:954`), `spawnRobot`
    (`:1208`) and `regenerateMelody` (`regenerateMelody.ts:76`) pass theirs.
  - The rebuild's order stays. Making the locale current earlier would change what every attenuation-style subscriber
    sees mid-rebuild; passing the robot is local.
  - The accent loss predates the branch, but a power cycle used to repair it through `reRegisterAllRobotsAudio`, and a
    pause no longer does. Crawford: fix it here (Open Question 3).
- **Keep names a new save, never an existing one (R6).** With nothing loaded, Keep uses `currentSessionName`
  unless a save already has that name. In that case it draws suggestions until one names no save, then falls back to a
  numbered suffix. `detachLoadedSession`'s re-suggestion avoids existing names too. Comms' Save keeps overwriting by
  name, because its field shows the name it writes.
- **A row's trailing slot lives outside the roving-focus root (R8).** Radix's roving root redirects its own focus to
  the selected item (`@radix-ui/react-roving-focus`, `tabIndex` and the focus redirect). So any tab stop inside the
  root, ahead of the selected item, turns Shift+Tab into a loop.
  - The default fix: `RadioButton`'s `list` branch renders each trailing node after the root in DOM order and places it
    on its row with a CSS grid.
  - First check in Chrome and Safari that the root keeps its group role if it is made `display: contents`. If not,
    position the trailing nodes over their rows from measured offsets instead.
  - Moving Roll out of the list would undo Crawford's note 2, so it is not an option here.

## Dependency Graph

```
R1 (tear down a replaced paused world)    R2 (LFO bank follows the store when primed)
            │                                          │
            └──────────────── Checkpoint A ────────────┘
                                   │
R4 (Voice push) → R14 (push exhaustive + guarded) → R33 (aspect change re-deals in place) → R3 (intent while a change waits)
                                   │
R5 (melody accents)  R6 (Keep names)  R7 (Foundry detach)  R8 (Roll focus)  R9 (link tests)
                                   │
                              Checkpoint B
                                   │
             R10 (deleted constants in docs)      R11 (spec; after R1 and R33)
                                   │
                              Checkpoint C
                                   │
R12 (after R3) R13 (after R33) R15 (after R13) R16 (after R7) R17 (after R9) R18 R19 R20 R21 R22 (after R33) R23 R24 R25 R26 R27 (after A)
                                   │
                              Checkpoint D
                                   │
             R28 (after R1)  R29 (after R27)  R30  R31 (after R1, R30)  R32 (after R31)
                                   │
                           Checkpoint: Complete
```

## Task List

Every task names its **Proof**, decided here so the build never has to:
- **RED test** for behaviour: a test that imports or renders the code and fails first.
- **Probe** for what only the browser shows: one of the five measurements above, recorded in the commit.
- **Look** for CSS or visuals.
- **Mutation** for a test-only task: the named mutants die.
- **Read** for docs, comments and deletions.

Only a RED-test or Mutation task lists a `*.test.ts(x)` in its Files. Each behaviour change is mutation-checked: break
the guarded line on purpose and watch its test fail.

### Phase A: The cold world (the Critical)

- [x] **R1: `worldTransition.ts` — a world change tears a paused world down first** (`608f2b85`)

  **Description:** Add `tearDownPausedWorld()` beside `startLocaleSystems` (`worldTransition.ts:152`). It calls
  `stopRobotLifecycle()`, `stopWorkLoop()`, `stopAudioSwells()`, `AudioEngine.killAll()` and `resumeWorldTimelines()`,
  in that order. `retransmitWorld` (`:380`) calls it after its no-op return and before the loading write when
  `getWorldState() === 'paused'` and the mode rebuilds: `loadingOnly`, `coordsOnly`, `both`, or `attenuationStyleOnly`
  with `action.loading`. The world then builds held and `initializeLocale` writes `'cold'` (`:139`), as now.

  The cold path in `powerOnSequence` (`powerController.ts:88-96`) needs no new branch: after `killAll`, its `start()`
  runs in full, and `Tone.start()` wakes the suspended context. So its `AudioEngine.resume()` (`:91`) and the comment
  above it go, since nothing needs them any more. A fresh page's first start never had a suspended context to wake.

  **Proof:** RED test — `src/systems/powerController.world.test.ts` (the real chain: real `timelineMap`, `killAll`
  already a spy there), new cases:
  - Power on, `pause()`, then `retransmitWorld({ coordinates: { x: 3, y: 4 } })` with the power flag off. Expect:
    `killAll` called once; the three stop functions called before the new roster spawns; the state `'cold'`.
  - After that change, `setTimeline('probe', gsap.timeline(), 'world')` registers a playing timeline. This fails today.
  - A global swell started before the pause (`tickAudioSwells(localeId, 0)`, with the noise mocked as in
    `audioSwells.test.ts:183`) is gone after the change: `getActiveSwellSnapshot('global')` is `[]`. This fails today.
  - The next `powerOnSequence()` calls `start` after `killAll`.
  - A retransmit while running calls no `killAll` and stays `'running'`.
  - An Attenuation-Style-only retransmit while paused tears nothing down and stays `'paused'`.

  **Probe:** measurements 1 and 3: 0 `'world'` timelines paused after on → off → pick → on, and the clock reads under
  1.5 measures 6 s after the power-on that follows a Roll.

  **Acceptance criteria:**
  - [x] A replaced paused world leaves no lifecycle tick, work loop, swell, transport position or paused span behind.
  - [x] The next power-on is a full start; a resume after a plain pause is unchanged (`powerController.test.ts`'s
        resume cases pass unmodified).
  - [x] The cold path no longer calls `AudioEngine.resume()`. The case at `powerController.test.ts:115-133`, which
        pinned that call, flips with it.
  - [x] Boot, the link boot and a cold world's second world change still tear nothing down: the check is
        `'paused'`, not "held".
  - [x] Mutants die: drop each of the five calls, and flip the `'paused'` check.

  **Verification:**
  - [x] `npx vitest run src/systems/powerController.world.test.ts src/systems/powerController.test.ts src/systems/worldTransition.test.ts`
  - [x] `npm run build:types`, `npm run lint` clean; the two probes recorded in the commit.

  **Dependencies:** None.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/powerController.ts` (comment), `src/systems/powerController.world.test.ts`

  **Estimated scope:** M (one new function, one call, six cases in the real-chain file)

  **As shipped (2026-10-31, `608f2b85`):**
  - The teardown case runs over all four rebuilding modes. Two more cases cover the "second world change": one after a
    replaced paused world (`killAll` stays at one call) and one for a cold world (no call).
  - A second case pinned the cold path's `resume()`: `powerController.test.ts:135`, a fresh page's first start. It
    flipped too.
  - 11 of 11 mutants died: the five calls, `killAll` ahead of the stops, the `'paused'` check flipped, the power flag
    in its place, the predicate without the loading, the predicate always true, and the cold path's `resume()` back.
  - Probe 1: 0 of 93 `'world'` timelines paused (was 64 of 94), and 0 of 82 right after the pick.
  - Probe 3: "under 1.5 measures" depends on the rolled world's tempo; one roll near 60 BPM read exactly 1.5. So the
    probe also records the measure at power-on: 0 after the Roll, then 1.0625 six seconds later at 42 BPM (1.05
    expected from zero). A fresh page reads 0, then 1.125 at 43 BPM.

- [x] **R2: `lfoEngine.ts`, `audioStore.ts`, `sessionDiff.ts`, `worldTransition.ts` — the LFO bank follows the store when primed** (`0208992f`)

  **Description:**
  - Export `isBankPrimed()` from `lfoEngine.ts` (the module's `primed`, `:62`).
  - `syncGlobalAudioToCurrentAttenuationStyle` pushes when the bank is primed (`audioStore.ts:755`, now
    `isAudioContextRunning()`); its comment at `:750-754` changes with it.
  - `applySessionPayload`'s bank and link overlay chooses the pushing setters on the same test (`sessionDiff.ts:553`,
    `:561`); check the setters they call for a context gate of their own.
  - `regenerateGlobalHalfFromSeed` (`worldTransition.ts:232-238`) ends with the same push, through an exported
    `pushLfoBankAndLinksToEngine` (`audioStore.ts:758`).
  - Unprimed, every write stays data-only, as now.

  **Proof:** RED test, with `lfoEngine` mocked and the context reporting `'suspended'` while the bank is primed:
  - `src/stores/audioStore.test.ts`: an Attenuation Style switch pushes every lane and link.
  - `src/utils/sessionDiff.test.ts`: a payload's bank goes through the pushing setters.
  - `src/systems/worldTransition.test.ts`: a loading-only retransmit pushes.
  - Unprimed: no push in any of the three.

  **Probe:** measurement 2: after on → off → Roll → on, the engine's four lanes equal the store's.

  **Acceptance criteria:**
  - [x] While paused, a new world's bank and global links reach the engine's nodes.
  - [x] Before the first start nothing is pushed.
  - [x] Mutants die: restore the running gate at each site; drop the new push.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts src/utils/sessionDiff.test.ts src/systems/worldTransition.test.ts src/engine/lfoEngine.test.ts`
  - [x] `npm run build:types`, `npm run lint` clean; the probe recorded in the commit.

  **Dependencies:** None.

  **Files:** `src/engine/lfoEngine.ts`, `src/stores/audioStore.ts`, `src/utils/sessionDiff.ts`, `src/systems/worldTransition.ts`, `src/stores/audioStore.test.ts`, `src/utils/sessionDiff.test.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** M (four small edits, three test files)

  **As shipped (2026-10-31, `0208992f`):**
  - The gate lives inside the exported `pushLfoBankAndLinksToEngine`, so the style-sync and the loading change call it
    plainly. The two setters the session overlay uses have no context gate of their own. `primeLfoBank` keeps its
    running-context guard, because it builds the nodes.
  - `src/engine/lfoEngine.test.ts` gained the `isBankPrimed` cases. It is not in the Files list above, but without it a
    broken getter survives, since the three consumer files mock or spy it.
  - Every existing case that drove the overlay through the context spy now drives it through `isBankPrimed`, both
    branches kept. Beyond the plan's cases, two more pin the gate from the other side: an unprimed bank with the context
    running pushes nothing. The world-transition cases also check the push comes after the regenerations, and that a
    theme riding on a plot move pushes while a plain plot move does not.
  - 9 of 9 mutants died: the running gate restored at each of the three sites, no gate, each push dropped, the push
    ahead of the regenerations, and the getter forced true or false.
  - Probe 2: the engine's four lanes equal the store's right after the Roll while off and after the power-on, and the
    Roll changed every lane.
  - **Follow-up `5c5264de`:** the store's module-load style-sync now reads `isBankPrimed`. Five more test files mock
    `lfoEngine` without it, so Checkpoint A's full suite failed 175 tests in 6 files, two suites before they loaded.
    Each mock gained `isBankPrimed: vi.fn(() => false)`. The per-task run of the four named files had missed it.

### Checkpoint A: The cold world
- [x] `npm run build:types`, `npm run lint`, `npm test` clean. At `5c5264de`: types clean; lint 0 errors (the 4 old
      warnings); `npm test` 13,036 of 13,037 across 344 files. The one failure is the documented `sceneToOrbiterLocal`
      round-trip timeout, "Test timed out in 5000ms" under the parallel run, in a file Phase A does not touch.
- [x] Probes 1, 2 and 3 recorded: nothing paused, the bank equals the store, the clock restarts. On the final tree:
      0 of 94 `'world'` timelines paused; all four lanes equal the store's; the clock reads 0 at power-on and 2.125
      six seconds later at 84 BPM (2.1 expected from zero).
- [x] Crawford: the Look at a world picked while off (its bubbles and flicker moving behind the veil, his choice in Open
      Question 1), and a listen: a picked world starts from the top, its LFO motion as on a fresh load of the same link.
      Passed 2026-10-31: "everything looks and sounds good".
- [x] Reviewed with human before Phase B (2026-10-31).

---

### Phase B: The Required fixes

Build order: R4, R14, R33, R3, then R5–R9.

- [x] **R4: `AudioEngine.ts`, `spawnSystem.ts` — the deal's Voice change reaches the engine during a rebuild** (`60ab94ab`)

  **Description:** `reReserveVoice(robotId, robot?)` (`AudioEngine.ts:1019`) uses the given robot before
  `findActiveRobot`. `applyAspectDeal` passes the robot it just dealt (`spawnSystem.ts:954`). Every other caller is
  unchanged.

  **Proof:** RED test — `src/systems/worldTransition.test.ts` (or `spawnSystem.test.ts`). Run the real
  `reReserveVoice` with only `reserveVoice` spied (`mockImplementation(() => true)`). A coordinates retransmit with
  `voice: ['glassy']` loaded should call `reserveVoice` a second time for each Voice-dealt robot, with the dealt layers
  the store now holds. Today it is called once, with spawn's undealt layers. The existing case at
  `spawnSystem.test.ts:4076` mocks `reReserveVoice` and stays as it is.

  **Acceptance criteria:**
  - [x] A Voice-dealt robot sounds its dealt waveform after Foundry's Retransmit or a Load while the tablet is on.
  - [x] Pan and sends are handed back as now (`AudioEngine.ts:1038-1042`).
  - [x] Mutant dies: drop the passed robot.

  **Verification:**
  - [x] `npx vitest run src/systems/worldTransition.test.ts src/systems/spawnSystem.test.ts src/engine/AudioEngine.test.ts`
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`, `src/systems/spawnSystem.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** S

  **As shipped (2026-10-31, `60ab94ab`):**
  - The parameter is `given`, so the body keeps its `robot` local: `const robot = given ?? findActiveRobot(robotId)`.
  - The worldTransition case runs twice: a coordinates retransmit, and a theme change, which rebuilds the plot in place
    (the review's second experiment; after R33 an aspects-only change no longer rebuilds, so the theme carries it).
    Both: 12 of 12 robots get a second `reserveVoice` with the store's dealt layers, where they got one before.
  - Two files beyond the Files list: `AudioEngine.test.ts` gained a unit case (a robot outside the active locale is
    built from the copy given, its manual pan and sends handed back from it; the copy given wins over the locale's
    own; nothing given, the lookup as before), and `spawnSystem.test.ts`'s Voice-deal case at `:4076` now expects
    `(robot.id, robot)`. It still mocks `reReserveVoice`, but `toHaveBeenCalledWith` matches every argument, so the
    one-argument expectation could not stay.
  - 3 of 3 mutants died: the deal drops the robot; the engine ignores it; the engine uses it only as a fallback after
    the lookup (only the unit case kills that one).

- [x] **R14: `applyAspectDeal` — the engine push is exhaustive and guarded** (moved up from Phase D: R33 reuses this push) (`b736da43`)

  **Description:**
  - The push is an `if` chain (`spawnSystem.ts:950-956`), while `deriveFamilyFields` (`:845-862`) is an exhaustive
    `switch`, so a fifth family would be dealt and never pushed.
  - Make it one per-family function (a `switch` with a `never` check) that R33's re-deal calls too.
  - Wrap each robot's push in the `try`/`catch` that `spawnRobot` uses (`:1197-1203`), so one throwing push cannot
    abort `initializeLocale` part-dealt.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: a push that throws for one robot leaves the others dealt and
  pushed. The exhaustiveness is checked at compile time.

  **Acceptance criteria:**
  - [x] Every dealt family's push still runs after the store write.
  - [x] A mocked push asserts the robot is already dealt; that also closes the test gap of moving the pushes above
        `updateRobot`.

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts`; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** R4.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S

  **As shipped (2026-10-31, `b736da43`):**
  - The function is `pushFamilyToEngine(family, robot, localeId)`, private to `spawnSystem.ts`. The guard sits inside
    it, around the switch, so R33's re-deal gets it too.
  - The guard is per family, finer than the plan's "each robot's push": a robot whose Envelope push throws still gets
    its Distance and Voice pushes. The test pins that, and the "one guard per robot" mutant dies on it.
  - The test deals all four families and records, at every mocked push, whether the store already held the robot dealt
    with the value pushed. Today the throw escaped the deal.
  - 6 of 6 mutants died: no guard; one guard per robot; pushes before the write; pushes the pre-deal robot; Distance
    pushes nothing; every family pushed whether dealt or not. The compile-time check was proved by hand: with the
    `voice` case removed, `tsc` fails with `Type '"voice"' is not assignable to type 'never'`.

- [x] **R33: `worldTransition.ts`, `spawnSystem.ts`, `OffScreen.tsx` — an aspect change re-deals the live roster in place** (Crawford, 2026-10-31) (`d336b76c`)

  **Description:** See the Architecture Decisions.
  - `resolveRetransmitAction` (`worldTransition.ts:192-198`) returns a new `aspectsOnly` mode when no name and no plot
    are given and the loading changes only its aspects. A theme change, with or without aspects, stays `loadingOnly`.
  - `retransmitWorld` handles `aspectsOnly` by writing the loading store, calling a new `redealAspects(localeId)`, and
    mirroring the URL, as every mode does. It neither regenerates the global half nor rebuilds the locale.
  - `redealAspects` sits beside `applyAspectDeal` (`spawnSystem.ts:938`). It deals the new picks over the locale's
    companies and robots (`dealAspects`). Then, for each robot and each family whose dealt aspect differs from
    `robot.loadedUnder`, it re-derives that family's fields from the robot's own spawn index:
    - under `resolveBands(theme, { [family]: aspect })` for a family still dealt;
    - under `resolveBands(theme, {})`, the theme's own draw, for a family no longer dealt.

    It writes the fields and the new `loadedUnder` through `updateRobot`, then pushes that family through R14's push.
  - `OffScreen`'s `onFamilyChange` (`OffScreen.tsx:359`) calls `retransmitWorld({ aspects })` directly, with no
    `requestWorldChange`, unless a theme or world change is pending (R3).
  - R1 leaves it alone: `aspectsOnly` rebuilds nothing, so a family change while paused tears nothing down and the
    world stays paused.

  **Proof:** RED test:
  - `src/systems/worldTransition.test.ts`: an `aspectsOnly` retransmit keeps the locale id and every robot's position,
    battery and activity, regenerates nothing global (`regenerateGlobalAudioFromSeed` is not called), and mirrors the
    URL.
  - `src/systems/spawnSystem.test.ts`:
    - Only the families whose dealt aspect changed are re-derived; a tweak on an unchanged family survives.
    - Emptying a family restores the theme's draw: the fields equal an undealt spawn of the same noise and index, and
      the family leaves `loadedUnder`.
    - The re-dealt fields equal what a rebuild under the same loading deals, family for family.
    - Each changed family is pushed once.
  - `src/utils/sessionDiff.test.ts`: after an in-place re-deal of an untweaked world, `buildSessionPayload`'s robot diff
    is `{}`, so the baseline agrees.
  - `src/components/panels/screen/screens/OffScreen.test.tsx`:
    - A family toggle applies at once and leaves `sceneWash` `'clear'`.
    - Two toggles in one family, and toggles in two families, both land (two of the review's experiments).

  **Probe:** measurement 4: Hypnotic then Wandering 150 ms apart leaves `{ melody: ['hypnotic', 'wandering'] }`, with no
  wash raised and no long task.

  **Acceptance criteria:**
  - [x] An aspect change moves only the re-dealt families' fields; the world keeps playing, or stays paused.
  - [x] A theme change, a world pick and Roll still rebuild under the wash.
  - [x] Mutants die:
    - drop the undeal branch;
    - re-derive every family instead of the changed ones;
    - skip the push;
    - route the family row back through `requestWorldChange`.

  **Verification:**
  - [x] `npx vitest run src/systems/worldTransition.test.ts src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] `npm run build:types`, `npm run lint` clean; the probe recorded in the commit.

  **Dependencies:** R14.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/spawnSystem.ts`, `src/components/panels/screen/screens/OffScreen.tsx`, `src/systems/worldTransition.test.ts`, `src/systems/spawnSystem.test.ts`, `src/utils/sessionDiff.test.ts`, `src/components/panels/screen/screens/OffScreen.test.tsx`

  **Estimated scope:** M (a mode, one re-deal function, the row's handler)

  **As shipped (2026-10-31, `d336b76c`):**
  - **How the re-deal reads its targets.** `redealAspects` deals the picks over the live companies onto the roster a
    rebuild would spawn: `generateRobotRosterBaseline` under the installed theme, then `applyDealToBaselines`. Each
    moved family takes that robot's fields through a new `familyFieldsOf`, a switch beside `deriveFamilyFields`, key
    for key. For a family still dealt, that is the aspect's own-index re-derivation, as planned.
  - **Deviation: the undeal.** For a family no longer dealt, the target is the theme's draw as the roster spawned it,
    not "the same derive function spawn uses" at the robot's own index. A copied robot (30 % seeded) spawns with its
    source's Melody, Envelope and Voice, so only the spawn replay matches the plan's own test ("the fields equal an
    undealt spawn"). It also keeps Keep's diff empty. The own-index draw is a mutant, and the copied-robot case kills it.
  - **Addition: swells.** The swells riding each re-derived field are dropped before the write (Envelope's four adsr
    fields, Distance's five sends, Voice's six layer gains and detunes; Melody's fields never swell), as a hand edit
    drops them (`RobotScreen.tsx`). A paused world keeps its swells. Left riding, one returns its field to the old base
    on resume, and Keep's diff saves that base (`sessionDiff.ts`).
  - **Addition: the drop is an argument.** `redealAspects(localeId, dropSwell)` takes the drop as a parameter;
    `retransmitWorld` hands it `cancelSwellForRobotAttribute`. Importing `audioSwells` into `spawnSystem` pulls the
    audio store in at module load, and its style-sync calls `AudioEngine.setBPM`. `OffScreen.test.tsx`, whose engine
    mock has no `setBPM`, then failed to load (R2's blast-radius trap).
  - **Choice: the selection.** An aspects-only change keeps the selected robot and company, since no id changes. Every
    rebuild still resets them. Flag for Crawford if he wants the old reset.
  - **Tests beyond the plan's list:**
    - the paused world stays paused;
    - a theme with aspects still rebuilds;
    - the same picks touch nothing;
    - a copied robot comes back to its source's values;
    - a Voice move carries the bus filter's type;
    - the deal follows a robot moved into another company (the plan's "over the locale's companies");
    - the swell drop, both through `retransmitWorld` and with a real forced swell in `sessionDiff.test.ts`.
  - **A test fixed after its first run:** the robot-for-robot comparisons first failed only on melody event ids, which
    are fresh UUIDs per generation. They now compare without them.
  - **Old tests rewritten:** the worldTransition case "aspects alone do the same" pinned the rebuild and now pins the
    re-deal. The OffScreen wash case "a family toggle retransmits once covered" now says "applies at once with no cover".
  - 18 of 18 mutants died. "Voice leaves filterType" survived at first, because no robot in the fixtures changed filter
    type; the bus-filter case was added for it.
  - **Probe 4:**
    - Dev server: the locale id kept, both picks held, the bar `melody=hypnotic,wandering`, the wash never left
      `clear`. Page-side, a Melody re-deal is 4.6–7.2 ms. The first click shows one 82–87 ms task in dev React, on top
      of a ~75 ms task every second that the idle dev page also has.
    - Production build, 3 runs: no long task, wash opacity never above 0, both toggles pressed and in the bar.
  - **Finding (not fixed):** a Voice toggle rebuilds 12 voices, 137–159 ms on the production build, still under no
    wash. Before the first power-on those rebuilds are wasted, since the first start rebuilds every voice from the
    store. Recorded for Crawford, per the finish-the-branch rule.

- [x] **R3: `OffScreen.tsx`, `worldChange.ts` — clicks made while a world change waits all count, and show at once** (`e7c6d5fc`)

  **Description:** See the Architecture Decisions. After R33, only theme picks, world picks and Roll wait under the
  wash.
  - **The intent.** While one is pending, `OffScreen` keeps the click's intent: the pick, the theme and the four
    families' sets. `onChange`, `onThemeChange` and `onFamilyChange` (`OffScreen.tsx:239`, `:284`, `:359`) update it at
    each click, and it clears once the change has run. A family toggle made while a change is pending joins the intent
    instead of re-dealing.
  - **The request.** The pending request realises the whole intent: a pending pick's `applySessionPayload` and names,
    then `retransmitWorld({ theme, aspects })` if the intended loading differs from the pick's own. Roll realises the
    loading after `rollWorld`.
  - **The display.** While the intent is set, the rows, description lines and readout draw from it, so a pick shows at
    the click (Open Question 2).
  - **Cancel.** `worldChange.ts` gains `cancelWorldChange()`: it drops the pending change, and the cover still lands
    and uncovers, running nothing. A Current click while a pick is pending calls it.
  - **Keep** is disabled while a change is pending.

  **Proof:** RED test — `src/components/panels/screen/screens/OffScreen.test.tsx`, in "world changes wait under the
  scene wash":
  - A theme pick then a toggle before `land()` leaves both. This is a review experiment and fails today.
  - A preset then Current applies nothing. This is a review experiment and fails today.
  - A preset then a toggle leaves the preset's world with the toggle.
  - A preset then a theme pick leaves the preset's world under that theme.
  - A click shows its row checked before `land()`. This rewrites the case at `:1238`, which pins the late selection.
  - Keep is disabled between a click and `land()`.

  In `src/systems/worldChange.test.ts`: a cancel drops the pending change; the state still runs `covered` →
  `uncovering` → `clear`; a cancel with nothing pending does nothing.

  **Acceptance criteria:**
  - [x] No click made while a change waits is lost; two world picks still keep only the last.
  - [x] The selection, the description line and the readout follow the click, not the world.
  - [x] Under reduced motion (the change runs at once), every existing case passes unmodified.
  - [x] Mutants die: drop the intent from a handler's request; drop the cancel; enable Keep while pending.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/systems/worldChange.test.ts`
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** R33.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/systems/worldChange.ts`, `src/components/panels/screen/screens/OffScreen.test.tsx`, `src/systems/worldChange.test.ts`

  **Estimated scope:** M (smaller after R33, which takes the aspect rows out of the wash)

  **As shipped (2026-10-31, `e7c6d5fc`):**
  - **The intent** is an `Intent` (in `OffScreen.tsx`): at most one world part (a save or preset to apply, or a Roll; the
    last world click wins), the theme and the families' sets, the row the list shows, and `from`, the loading shown at
    the first click. It lives in a ref, which the request reads at the cover, and in state, which the rows draw from;
    the two are set together.
  - **The request** is one `realise` per cover: the world part, then `retransmitWorld` with only the parts of the
    loading that differ. A world part is compared against its own payload's loading. A Roll, or no world part, is
    compared against `from`. So a theme pick alone still sends `{ theme }`, and a save that carries its own loading
    sends nothing after its apply.
  - **Two consequences the plan implied, now pinned by tests:**
    - A world pick's own loading replaces a theme clicked before it, as applying it would.
    - A save then Roll rolls and then lays the save's loading over the rolled world, as the two clicks do without the
      wash.
  - **The readout** for Current while a change waits names the world that change leaves, as far as it is known: a
    pick's world under the intended loading, or the loaded world's for a Roll, whose world is drawn only as it runs.
  - **A toggle made while a change waits** still sets its description line at the click (`lastOn`); a world pick
    resets `lastOn` at the click now, not at the cover.
  - **Two wash cases rewritten,** as the plan said for `:1238`. The preset case at `:1238` and Roll's case both pinned
    the late selection; both now expect the click's row at once. Every case outside the wash block is unmodified.
  - **Tests beyond the plan's list:**
    - a save then Roll;
    - a theme then a preset;
    - a save with its own loading;
    - two world picks shown at each click;
    - a spy that pins the Current click's `cancelWorldChange` call.
  - **The cancel** needs the spy. With the intent cleared, a stale pending `realise` would find nothing to do, so the
    drop is invisible through the screen. The plan asks for the call, so the spy pins it.
  - 14 mutants settled: 13 killed (the plan's three included). The 14th, `realise` without its null check, survived:
    the cancel makes that path unreachable, so the check was deleted, per the standing rule (fix the test or delete the
    code).

- [x] **R5: `AudioEngine.ts`, `spawnSystem.ts`, `regenerateMelody.ts` — melodies registered during a rebuild keep their accents** (predates the branch; Crawford: fix it here, Open Question 3) (`34df752f`)

  **Description:** `registerRobotMelody(robotId, melody, robot?)` (`AudioEngine.ts:1295`) uses the given robot before
  `findActiveRobot` (`:1309`), for the motif-group accent and the click track. `spawnRobot` (`spawnSystem.ts:1208`) and
  `regenerateMelody` (`regenerateMelody.ts:76`) pass theirs. The other callers (`robotOptionsActions.ts:145`,
  `robotSystems.ts:314`, `spawnSystem.ts:1358`) run with the locale current and may stay as they are.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`, beside the accent case at `:1558`. A motif-active robot that
  is not in the active locale, passed explicitly, gets `accentMultiplier > 1` on each window's first step. Today it gets
  none.

  **Acceptance criteria:**
  - [x] After a live retransmit, every motif-active robot's steps carry their accents.
  - [x] Mutant dies: drop the passed robot in `spawnRobot`.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/systems/spawnSystem.test.ts`
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`, `src/systems/spawnSystem.ts`, `src/engine/regenerateMelody.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

  **As shipped (2026-10-31, `34df752f`):**
  - The parameter is `given`, as in R4's `reReserveVoice`.
  - `regenerateMelody` passes the robot as stored, read back from its own locale after the write, with the copy it was
    given as the fallback. The plan said "pass theirs". Every `robotOptionsActions` caller hands it the stale prop with
    one field spread in ("since `robot` is the stale prop"), while today's lookup reads the store. The read-back keeps
    the store as the source and finds the robot during a rebuild too. A mutant passing the copy instead dies.
  - **Files beyond the list:**
    - `spawnSystem.test.ts`: in a locale that is not current, spawn and the deal's Melody push each leave every
      motif-active robot's plain window opening scheduling exactly the 1.25 group accent. The spawn case that pinned
      the two-argument call now expects the robot as well.
    - `worldTransition.test.ts`: the same after a live coordinates retransmit (the acceptance's wording).
    - `regenerateMelody.test.ts`: its store mock gains `getLocaleById`, and a case pins the read-back.
  - The test picks a window's opening note with no mark and no rest, because a mark multiplies the accent and a rest
    goes through `Tone.Time`; Classic seeds both often. The cases assert that such notes exist, and they do at both
    plots.
  - 5 of 5 mutants died: `spawnRobot` drops the robot; `regenerateMelody` passes none; `regenerateMelody` passes its
    stale copy; the engine ignores the robot; the engine uses it only as a fallback.

- [x] **R6: `sessionStore.ts` — Keep never overwrites another save** (`628704e8`)

  **Description:** `keepCurrentWorld` (`sessionStore.ts:74-80`) names the save `currentLoadedSessionName` when one is
  loaded, as now. Otherwise it uses `currentSessionName`, unless a save in `listSessions()` already has that name; then
  it draws `suggestSessionName()` (`:21`; 10 adjectives × 8 nouns) until one names no save, up to a bound, then adds
  " 2", " 3"… `detachLoadedSession`'s new name (`:87`) avoids existing saves the same way.

  **Proof:** RED test — `src/stores/sessionStore.test.ts`:
  - With a save named as `currentSessionName` and nothing loaded, Keep writes a new row and leaves that save
    untouched. Fails today.
  - With `Math.random` stubbed so the first suggestion names an existing save, Keep skips it.
  - With a save loaded, Keep still overwrites that save.

  **Acceptance criteria:**
  - [x] No Keep replaces a save that is not the loaded one.
  - [x] The loaded-save rule and the trim / blank fallback are unchanged (existing cases pass unmodified).
  - [x] Mutant dies: drop the collision check.

  **Verification:**
  - [x] `npx vitest run src/stores/sessionStore.test.ts src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/sessionStore.ts`, `src/stores/sessionStore.test.ts`

  **Estimated scope:** S

  **As shipped (2026-10-31, `628704e8`):**
  - `unusedSessionName(preferred)`: the preferred name when it is set and free, else up to 20 suggestions, else the
    last one numbered " 2", " 3"... (`FRESH_NAME_DRAWS = 20`; the word lists make 80 names). Storage keys a save by
    its exact name, so the check is exact.
  - The plan's three cases, plus the numbering (" 2", then " 3") and detach's suggestion skipping a held name. The test
    drives the draws by stubbing `Math.random`: one suggestion is two draws, the adjective then the noun.
  - The loaded-save case passes before and after, as a guard. The existing loaded-save, trim and blank cases pass
    unmodified.
  - 6 of 6 mutants died: the collision check dropped; a taken suggestion not drawn again; no numbering; numbering
    stuck at " 2"; detach without the check; the loaded save avoided too.

- [x] **R7: `SectorSettingsDrawer.tsx` — Foundry's Retransmit detaches the loaded save** (`1668550f`)

  **Description:** The request closure at `SectorSettingsDrawer.tsx:92` calls
  `useSessionStore.getState().detachLoadedSession()` after `retransmitWorld(input)`. The input only ever carries
  edited fields (`:80-90`), so every Retransmit that reaches the request changes the name or the plot: the world is no
  longer the save's. This is the case Task 14 added `detachLoadedSession` for.

  **Proof:** RED test — `src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`. With "Dusk Run" loaded,
  a Retransmit to new coordinates leaves `currentLoadedSessionName` `null` once the cover lands. With nothing loaded,
  nothing changes.

  **Acceptance criteria:**
  - [x] After a Foundry Retransmit, Current no longer reads "Dusk Run · …", and Keep writes a new row.
  - [x] Mutant dies: drop the detach.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/console/SectorSettingsDrawer.tsx`, `src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`

  **Estimated scope:** XS

  **As shipped (2026-10-31, `1668550f`):**
  - As planned: the detach runs inside the request, after the retransmit, so it lands with the cover.
  - Beyond the plan's cases: a new Attenuation Style name detaches too, and the save stays loaded while the change
    waits.
  - 2 of 2 mutants died: the detach dropped; the detach at the click instead of with the change.

- [x] **R8: `RadioButton.tsx` / `.css` — the trailing slot sits outside the roving-focus root** (`dcd94e0f`)

  **Description:** In the `list` branch (`RadioButton.tsx:211-238`; the slot at `:234`), render each row's trailing node
  after the Radix root, in DOM order, and place it on its row with a CSS grid (Architecture Decisions, with the role
  check and its fallback). The `cabinet` and `muted` appearances are untouched.

  **Proof:**
  - **RED test** — `src/components/ui/controls/RadioButton.test.tsx`. In the `list` appearance the trailing node is not
    a descendant of the radio group's root and follows it in DOM order. This is structure, which jsdom can see. Fails
    today.
  - **Probe** — measurement 5 with a preset selected: Shift+Tab from Keep reaches the selected row, then leaves the
    list. Tab from the selected row reaches Roll, then Keep.
  - **Look** — Roll still sits at the end of the Current row at 1600 × 900 and at 375 × 812.

  **Acceptance criteria:**
  - [x] No keyboard loop in either direction.
  - [x] Arrow keys move between the radios only.
  - [x] The group keeps its accessible role and name.
  - [x] Mutant dies: render the slot back inside the root.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/RadioButton.test.tsx src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] `npm run build:types`, `npm run lint` clean; the probe and the Look recorded in the commit.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/RadioButton.tsx`, `src/components/ui/controls/RadioButton.css`, `src/components/ui/controls/RadioButton.test.tsx`

  **Estimated scope:** M (markup and grid; the role check may send it to the fallback)

  **As shipped (2026-10-31, `dcd94e0f`):**
  - **Deviation: subgrid, not `display: contents`.** A new `.sc-radio-button__list` grid has two columns, the rows' and
    the slots'. The Radix root spans both columns and every line, and passes them down as a subgrid. Every row and
    divider takes a line of its own (`listLines`, set inline), and a slot takes its row's line in the second column.
    The root keeps its box, so the group role is never at risk and nothing is measured. The plan's role check and its
    measured-offset fallback were not needed.
  - **Probe 5** (dev server, 1600 × 900, Vessport Null picked):
    - Shift+Tab from Keep: Roll, Vessport Null, then out of the list (Power on).
    - Tab from the selected row: Roll, Keep, then the theme row.
    - At `b148c1e8` it was Vessport Null, Roll, Vessport Null, Roll…
  - **Roles:** Chrome's accessibility tree has the group (role `group`, name Transmission) holding its four radios,
    with Roll outside. Safari was not checked (no Mac here); with no `display: contents` in play, the role is not at
    risk.
  - **Look (screenshots):** Roll at the end of the Current row at 1600 × 900 and at 375 × 812, vertically centred in
    it. Crawford's Look is Checkpoint B's.
  - **Rewritten:** `RadioButton.test.tsx`'s slot case at `:715`, which pinned the slot inside the row, and
    `OffScreen.test.tsx`'s "puts Roll in the Current row", which also checked the group held Roll.
  - **Added:** the line numbering with a divider; the group's role and name with arrow keys moving between the radios.
    Radix moves the roving focus in a timeout, so the test waits for it. Those two pass before and after, as guards.
  - 4 of 4 mutants died: the slot back inside the root; a divider taking no line; the slot taking no line; the root
    spanning no lines.
  - **Known difference:** hovering Roll no longer brightens an unselected Current row's border, since Roll is no longer
    inside the row.

- [x] **R9: the link and mirror tests — all four families, and names that need escaping** (`3181c858`)

  **Description:** Tests only; the code is right today.
  - `src/utils/worldLink.test.ts`: a world with `theme=calm&melody=hypnotic&envelope=plucked,held&distance=remote&voice=woody`
    round-trips through `encodeWorldLink` and `decodeWorldLink`.
  - `src/utils/sessionShareUtils.test.ts`: `mirrorWorldToUrl` writes all four families. A name like `a&x=999#b+c%`
    reads back from `window.location.search` as itself, with `x` untouched.

  **Proof:** Mutation. The four review mutants that live today must die:
  - the link writes only Melody (`worldLink.ts:132`);
  - the link reads only Melody (`:158`);
  - the mirror writes only Melody (`sessionShareUtils.ts:77`);
  - the mirror writes the name unescaped (`:94`).

  **Acceptance criteria:**
  - [x] Each family param is pinned in both directions, and the mirror's escaping is pinned.

  **Verification:**
  - [x] `npx vitest run src/utils/worldLink.test.ts src/utils/sessionShareUtils.test.ts`
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/worldLink.test.ts`, `src/utils/sessionShareUtils.test.ts`

  **Estimated scope:** S

  **As shipped (2026-10-31, `3181c858`):**
  - The link case also decodes the plan's literal search string. The mirror case checks `x` with `getAll`, so a leaked
    `x=999` would show, and checks that no hash was made.
  - Mutation, each review mutant run against the old tests and the new: 0 of 4 killed before, 4 of 4 after, each by
    exactly one case. A sanity mutant (the mirror drops `y`) dies on 8 cases.

### Checkpoint B: The Required fixes
- [x] `npm run build:types`, `npm run lint`, `npm test` clean. At `3181c858`: types clean; lint 0 errors (the 4 old
      warnings); `npm test` 13,091 of 13,091 across 344 files. That is 55 more than Checkpoint A's 13,036, the
      removed flake already counted.
- [x] Probes 4 and 5 recorded (the R33 and R8 commits).
  - **4:** Hypnotic then Wandering leaves `{ melody: ['hypnotic', 'wandering'] }` in the same locale, the bar
    `melody=hypnotic,wandering`, and the wash clear. On a production build there is no long task and the wash opacity
    stays 0. A Voice toggle is one 137–159 ms task, recorded under R33.
  - **5:** no loop. Shift+Tab from Keep goes Roll, the selected row, then out of the list; Tab from the selected row
    goes Roll, then Keep.
- [x] Crawford: the Look at the off screen. **Passed** (Crawford, 2026-10-31). Hard-reload any open dev page first
      (Ctrl+Shift+R): engine, store and system files changed.
  - An aspect toggle applies at once, with no wash (R33).
  - A theme or world pick shows at the click, and the world follows under the wash (R3).
  - Roll still sits on the Current row (R8).
- [x] Reviewed with human before Phase C (2026-10-31).

---

### Phase C: Docs (Required)

- [x] **R10: the docs that still name constants Task 21 deleted** (`b8986433`)

  **Description:** Point each passage at the band key in `src/data/bands/classic.ts`; the values are still Classic's.
  - `docs/AUDIO_SYSTEM.md:452-453`: `LFO_QUIET_THRESHOLD = 0.7`, `LFO_BUS_QUIET_THRESHOLD`,
    `ROBOT_LFO_GAIN/DETUNE/BUS_DEPTH_SEED_RANGE` and `ROBOT_LFO_DEPTH_SEED_MIN` "in `spawnSystem.ts`", and
    `robotLfoQuietThresholdForTarget`. These are now `robot.lfoGainDepth`, `robot.lfoDetuneDepth` and
    `robot.lfoBusDepth`, read through `robotLfoBandForTarget` (`spawnSystem.ts:520`).
  - `docs/reference/ROBOT_DATA_GRID.md:20, 28, 29`: `DYNAMICS_SEED_RANGE`, `RESTS_SEED_RANGE`, `ACCENTS_SEED_RANGE`.
  - `docs/PROCEDURAL_GENERATION.md:90-98`.
  - `docs/reference/SLIDER_VALUES.md:171, 251, 329-331`.
  - `docs/reference/TONE_EFFECTS_INVENTORY.md:118`.
  - The source comment `src/engine/audioEngine/busFilter.ts:8` ("spawnSystem's ACCENT_FILTER_FREQ_RANGE").

  Spot-check every name against `classic.ts`.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] No live doc names a deleted constant as if it existed (`grep -rw` over `docs/` outside `docs/tasks/`,
        `docs/intent/` and the archives).

  **Verification:**
  - [x] Manual review against `classic.ts`; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** the docs above, `src/engine/audioEngine/busFilter.ts` (comment)

  **Estimated scope:** S (docs only)

  **As shipped (2026-10-31, `b8986433`):**
  - Task 21 deleted 28 constants and two lookups (`robotLfoDepthSeedRangeForTarget`, `robotLfoQuietThresholdForTarget`).
    The grep used all 30 names.
  - Each passage names the band key and Classic's value, and says where a theme or aspect moves the band (checked
    against `themes.ts` and `aspects.ts`; no theme or aspect moves the LFO bands, Portamento, Volume, Dynamics or
    Accents).
  - **Beyond the listed lines**, all found by the grep:
    - `AUDIO_SYSTEM.md:367`, the bus filter's two cutoff tiers;
    - `SLIDER_VALUES.md:191`, `:237`, `:239-240`, `:250`, `:253` and `:296`, plus a sentence at the head of Robot
      Detail View on which load values are bands;
    - two comments: `spawnSystem.ts:519` now says "the old" `LFO_BUS_QUIET_THRESHOLD`, as `:518` already did for
      `LFO_QUIET_THRESHOLD`; `spawnSystem.test.ts:314` pointed at the deleted constant's doc comment and now gives
      the reason inline.
  - **Left as written,** as dated records of the code at their time (the Robot Send Table plan's precedent for 50.2):
    - the specs `ROBOT_ARTICULATION`, `ROBOT_PERFORMANCE`, `LFO_BANK`, `LFO_LOAD_FIX`, `ROBOT_LIVE_VISUALS`,
      `FREE_SYNC_TOGGLE` and `GLOBAL_COLOUR`;
    - `OFF_SCREEN.md`'s survey (`:87-89`), which its header says is "left as it was read";
    - `docs/ideas/themes.md:29` and `:77`.
  - The other `LFO_QUIET_THRESHOLD` hits are `globalAudioSeed.ts`'s own constant (0.34), which still exists.
  - Checks: types clean; lint 0 errors (the 4 old warnings); `spawnSystem.test.ts` 268 of 268.
  - **Found, not fixed:** `SLIDER_VALUES.md`'s Volume load range (65–85) leaves out the register bias that
    `spawnSystem.ts` adds after the band draw. The bias runs from −0.075 (treble) to +0.125 (bass), and the result is
    clamped to 0.5–0.95, so a fresh robot loads at 0.575–0.95 before the percent rounding. It predates this branch.

- [x] **R11: `docs/specs/OFF_SCREEN.md` — the claims the code does not match** (`0cfc0401`)

  **Description:** Dated amendments, in the spec's own style:
  - §1.2 (`:378-380`) and assumption 5 (`:134-136`): after R1 the paused half is true. A world change while
    `'running'` is a live retransmit that stays `'running'` (Task 8), not a teardown to `'cold'`.
  - Assumption 5 (`:133`): `powerOnSequence` resumes when `'paused'`, with no "pick is still Current" condition.
  - `:129` and `:591`: `worldState` lives in `src/systems/worldState.ts`.
  - Assumption 24 (`:306`) and the file map (`:528`): `loadedUnder` is `Robot.loadedUnder` (`types/Robot.ts:313`), and
    `localeStore.ts` is unchanged.
  - `:279-280`: the deal runs in `generateDealtRosterBaseline` (`spawnSystem.ts:914`), around
    `generateRobotRosterBaseline`.
  - `:236`: the readout is `describeWorld`; the template was deleted.
  - `:464` and `:549`: `settings.ts` should read `sector.ts`, `company.ts` and `probe.ts`.
  - The §2 map gains `systems/worldState.ts`, `systems/worldBoot.ts`, `animation/offScreenTheatre.ts` and
    `utils/worldIdentity.ts`.
  - `:583`: a cover runs the change and any it requests in turn (`worldChange.ts:28-34`).
  - `:55`: `useOrbiterMotion.ts:301` is the `'ui'` kill token, not a world mover.
  - **After R33:**
    - An aspect change re-deals the live roster in place, with no rebuild and no wash. Amend assumptions 21–22, the
      `loadingOnly` description, `:352` ("a pick, Roll, or a theme or family change"), and the scene-wash bullet whose
      callers list "the theme and family rows".
    - The Task 31 rule that a family change drops the tweaks like a theme pick: now only the re-derived families'
      fields reset.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] Every amended sentence is spot-checked against the code after R1–R9, R14 and R33.

  **Verification:**
  - [x] Manual review; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** R1 and R33 (the §1.2 and deal wording follow them).

  **Files:** `docs/specs/OFF_SCREEN.md`

  **Estimated scope:** S (docs only)

  **As shipped (2026-10-31, `0cfc0401`):**
  - **Form.** Each amendment is an italic *Amended 2026-10-31 (OFF_SCREEN_REVIEW_FOLLOWUPS R<n>)* where the claim
    stands, as the revisions' amendments are. A header paragraph under the revisions' one names this round. The
    survey stays as read; its one correction (`:55`) is an amendment on that bullet. The links point at this plan,
    which is untracked until Crawford commits it (source comments already cite it).
  - **Every listed item** is in, at the lines the plan named; the spec had not changed since `b148c1e8`.
    `generateDealtRosterBaseline` is at `spawnSystem.ts:915` now.
  - **Beyond the list**, each the same claim where else it stands:
    - assumption 14: R6's Keep naming (`unusedSessionName`: the current name if free, then up to 20 draws, then a
      numbered suffix; a loaded save is still overwritten) and R3's dim;
    - assumption 10: the regeneration now ends with R2's primed push (`pushLfoBankAndLinksToEngine`);
    - §1.1's power-off story ("Flip on with Current → resume"): the world's state decides, not the row; a theme
      change leaves Current over a cold world, and an aspect change resumes re-dealt;
    - §1.4's `powerController.ts` bullet and §3's state bullet: where `worldState` lives;
    - §7 Q12 ("it is a retransmit and tweaks are gone anyway").
  - **The map** gains six files, not four: `data/bands/loadingIdentity.ts` (Task 20) and `utils/loadingNames.ts`
    (Task 30) were new and unmapped too. The revisions' paragraph listed them only as changed.
  - **Assumption 22's re-deal** follows R33 as shipped, not as planned: an undealt family takes the theme's draw as
    the roster spawned it (a copied robot's is its source's); the riding swells drop; the selection stays. One
    consequence the spec now states: the re-deal deals over the live companies, so a robot moved to another company
    takes that company's aspect at the next aspect change (pinned by `spawnSystem.test.ts`'s "deals over the live
    companies" case).
  - **Checked against:** `powerController.ts`, `worldState.ts`, `worldTransition.ts`, `spawnSystem.ts`,
    `worldChange.ts`, `OffScreen.tsx`, `sessionStore.ts`, `audioStore.ts`, `describeWorld.ts`, the content diff against
    `cc9a01f2`, and every `setTimeline` call site (14 `'world'`; `useOrbiterMotion.ts:304`, the survey's `:301`, is the
    default `'ui'`).
  - **Found, for R32:** `docs/AUDIO_SYSTEM.md:170` still says `retransmitWorld({ aspects })` is the `loadingOnly` mode.
    Added to R32's After-R33 list.
  - Types clean; lint 0 errors (the 4 old warnings).

### Checkpoint C: Docs
- [x] `npm run build:types`, `npm run lint` clean, plus `npm test` as at every checkpoint. At `0cfc0401`: types clean;
      lint 0 errors (the 4 old warnings); `npm test` 13,091 of 13,091 across 344 files, the same as Checkpoint B
      (Phase C added no test).
- [x] Crawford: both Reads. (2026-11-01, with Phase E's Reads: "looks fine".)
  - R10 (`b8986433`): `AUDIO_SYSTEM.md`, `PROCEDURAL_GENERATION.md`, `ROBOT_DATA_GRID.md`, `SLIDER_VALUES.md`,
    `TONE_EFFECTS_INVENTORY.md`, and three comments (`busFilter.ts`, `spawnSystem.ts`, `spawnSystem.test.ts`).
  - R11 (`0cfc0401`): the spec's amendments, each marked `OFF_SCREEN_REVIEW_FOLLOWUPS R<n>`.
  - Hard-reload any open dev page first (Ctrl+Shift+R): R10 touched comments in `src/engine` and `src/systems`.
- [x] Reviewed with human before Phase D. (After the fact: Crawford's Reads passed 2026-11-01, Phase D and E already built.)

---

### Phase D: Consider (all to be built: Crawford, 2026-10-31)

- [x] **R12: `worldChange.ts` — run the world change off GSAP's call stack** (`cc9dd74e`)

  **Description:** Today the cover's `onComplete` sets `'covered'`, and the module-scope subscriber (`worldChange.ts:40-42`)
  runs `runPending` inside that call. The whole rebuild, `AudioEngine` calls included, therefore runs on GSAP's tick,
  and a throw unwinds through GSAP's ticker. The letter of Strict Separation holds, and the rocker's off-click has the
  same shape (`PowerRockerSwitch.tsx:175-178`).

  The subscriber hands off through a resolved promise instead (`void Promise.resolve().then(runPending)`), as
  `fadeOffScreen` resolves one. This is not musical timing, so CLAUDE.md's timer rule does not apply. The wash's
  one-frame wait before the fade-out (36383ed2) stays: GSAP stamps a tween at the tick's start either way.

  **Proof:** RED test — `src/systems/worldChange.test.ts`: a throwing change no longer throws out of
  `setSceneWash('covered')`, and the state still reaches `'uncovering'`. Tests that `land()` then expect the change
  await a flush.

  **Acceptance criteria:**
  - [x] No world change runs inside a GSAP callback.
  - [x] Every existing ordering case passes after its awaited flush.

  **Verification:**
  - [x] `npx vitest run src/systems/worldChange.test.ts src/animation/sceneWash.test.ts src/components/panels/screen/screens/OffScreen.test.tsx src/components/panels/screen/console`
  - [x] Probe: the wash timings of the revisions plan's Checkpoint D (opaque by about 470 ms, last visible by about 1.4 s).

  **Dependencies:** R3.

  **Files:** `src/systems/worldChange.ts`, `src/systems/worldChange.test.ts` (and the callers' tests' `land()` helpers)

  **Estimated scope:** S

  **As shipped (2026-10-31, `cc9dd74e`):**
  - The subscriber hands `runPending` to `Promise.resolve().then(...)`, as planned. The hop needs two more things in
    `runPending`:
    - **A guard:** it runs only while the state is still `'covered'`. The hop opens a window between the landing and
      the run. In it, the wash unmounting (the detach runs the change at once and clears) or a reduced-motion request
      (runs at once, clears) would otherwise get a stray `'uncovering'` over a clear wash, and with no wash mounted
      nothing would ever clear it.
    - **A `catch` that logs** (`console.error('[worldChange] the world change failed', err)`); otherwise the throw is an
      unhandled rejection. The `finally` still uncovers.
  - A request made in that window replaces the pending change, as one while `'covering'` does. A test pins it.
  - **Tests in `worldChange.test.ts`:**
    - the throw case is rewritten: nothing throws out of `setSceneWash('covered')`, the throw is logged, and the state
      reaches `'uncovering'` after the hand-off;
    - four new cases: the change runs after the landing call returns; a request in the window; the wash unmounting in
      the window; a reduced-motion request in the window;
    - every ordering case awaits the hand-off.
  - **The callers' tests:**
    - `OffScreen.test.tsx`'s `land()` is an awaited async `act` (15 calls in 14 cases);
    - the drawer's two landings and the session list's one are awaited the same way;
    - `sceneWash.test.ts`'s `finish` awaits the hand-off after its tick, as a browser runs the promise once GSAP's
      frame callback returns.
  - **Beyond the Files list:** two places said the change runs synchronously inside the cover's completion, and both
    now say where it runs: `sceneWash.ts`'s header comment, and the two wash sentences in `docs/ANIMATION_SYSTEM.md`.
  - 3 of 3 mutants died: the subscriber calls `runPending` directly; no guard; no `catch`.
  - **Probe** (dev server on 5191, headless Chrome at 1600 × 900, `?seed=kr1nd4ra&x=12&y=68`, real clicks). The A/B
    against HEAD's `worldChange.ts` ran in the same session, each server restarted and its served file checked:
    - **Where the change runs.** The stack was captured when `'uncovering'` is set, inside `runPending`'s `finally`. On
      R12 it is 6 frames, with `runPending` at the bottom (a promise job), for all four gestures. On HEAD it is 18
      frames for all four: through the cover timeline's `onComplete`, GSAP's `render`, `updateRoot` and `_tick`.
      Proving the metric took two fixes, since its first two versions read "no GSAP" on HEAD too: V8's default 10-frame
      stack limit, then Vite serving GSAP from a pre-bundled chunk with no "gsap" in its name. It now looks for
      `onComplete`.
    - **The wash.** Four gestures (Roll, a preset pick, a theme pick, Foundry's Retransmit after an X edit while on),
      three runs each side:

      | Tree | Opaque (opacity ≥ 0.99) | Last visible |
      | --- | --- | --- |
      | R12 | 464–483 ms | 1.27–1.47 s |
      | HEAD | 464–487 ms (one Roll under load: 564 ms) | 1.27–1.47 s (that Roll: 1.70 s) |
      | The revisions' Checkpoint D | 457–471 ms | 1.21–1.39 s |

      Opacity ≥ 0.999 lands at about 498 ms, in the ease's last 1 %; Checkpoint D's figures match a reading at about
      0.99. No console errors.

- [x] **R13: `spawnSystem.ts` — split the derive and the deal into their own modules** (`d2024ea6`)

  **Description:** `spawnSystem.ts` grew from 1,168 to 1,367 lines, about 380 of them the derive and deal code. Moves,
  with no behaviour change:
  - The derivation (`seedCurve`, `seedToggleValue`, `currentMelodyBands`, `deriveMelodyFields`, `pickWaveform`,
    `currentEnvelopeBands`, `deriveEnvelopeFields`, `currentVoiceBands`, `deriveVoiceFields`, `currentSendBands`,
    `composeSends`, `composeExclusiveSends`, `deriveSendFields`; interleaved through `:116-670` with the generators that stay) goes to `src/systems/robotFieldDerivation.ts`.
  - The deal (`deriveFamilyFields`, `dealtFields`, `applyDealToBaselines`, `generateDealtRosterBaseline`,
    `applyAspectDeal`; `:835-970`), with R14's push and R33's `redealAspects`, goes to `src/systems/aspectDeal.ts`.
  - Callers (`worldTransition.ts:14`, `sessionDiff.ts`, the tests) import from the new homes. No re-export shims.

  **Proof:** Refactor — the suite passes with only import lines changed in tests, and the parity dump (see "How the
  findings were proven") is identical before and after.

  **Acceptance criteria:**
  - [x] No import cycle is added (rerun the review's cycle check).
  - [x] `spawnSystem.ts` keeps spawn and the baselines only.

  **Verification:**
  - [x] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** R4, R14 and R33 (behaviour first, then the move).

  **Files:** `src/systems/spawnSystem.ts`, the two new modules, their callers' import lines

  **Estimated scope:** M (mechanical)

  **As shipped (2026-10-31, `d2024ea6`):**
  - **The move was a script, not a retyping.** It cut exact line ranges out of `spawnSystem.ts`, checked each range's
    first and last line, and wrote them unchanged into the new files. `spawnSystem.ts` went from 1,475 lines to 941.
  - **`src/systems/robotFieldDerivation.ts`** holds the plan's thirteen functions. With them went the code only they
    read: `quantizeSend`, `WAVEFORMS`, the `MelodyFields` and `VoiceFields` types, and five constants (`LAYER_COUNT`,
    `LAYER_GAIN_STEP`, `DETUNE_STEP`, `ACCENT_BANDPASS_SHARE`, `FILTER_Q_STEP`). Nine names gained `export`, because
    spawn now reads them across the module line: `seedToggleValue`, `MelodyFields`, `deriveMelodyFields`, the four
    `current…Bands` readers, `composeSends` and `composeExclusiveSends`. `MelodyFields` is still
    `Pick<RobotAudioBaseline, …>`, through a type-only import of `spawnSystem`; it is erased at runtime.
  - **`src/systems/aspectDeal.ts`** holds the whole deal section, `:831-1064` before the move: `DealIdentity`,
    `DealtFields`, `deriveFamilyFields`, `dealtFields`, `applyDealToBaselines`, `generateDealtRosterBaseline`,
    `pushFamilyToEngine`, `applyAspectDeal`, `familyFieldsOf`, `FAMILY_SWELL_ATTRIBUTES` and `redealAspects`. It
    imports `spawnSystem`'s two roster baselines. `spawnSystem` imports neither new module's deal, so no cycle forms.
  - **Load order.** `spawnSystem` no longer imports `loadingStore`, whose module load installs the loading context.
    The app still loads the store through `worldTransition`, `sessionDiff` and the off screen. In tests the boot loading
    it installs is Classic, the context's own default, so no generator draws differently.
  - **Comments changed only where they named the old home:**
    - `redealAspects`' note on which tests would load the audio store;
    - `bandKeys.ts` (2), `types/Robot.ts` (1) and `classic.ts`'s robot section label;
    - one closing sentence on spawn's ROBOT ARTICULATION note;
    - a header comment on each new module.

    The orphaned "Generate random audio attributes" docblock now sits on `generateAudioAttributes`. Its wording is
    still R28's.
  - **Docs** that named `spawnSystem.ts` as the home of moved code now name the new file: `AUDIO_SYSTEM.md` (2),
    `MELODY_SYSTEM.md` (2), `SESSION_STORAGE.md`, `ROBOT_DATA_GRID.md` and `SLIDER_VALUES.md`. The spec has two dated
    R13 amendments, on the deal paragraph and on the file map. Historical specs are left as written.
  - **Tests:** only import lines changed (`spawnSystem.test.ts`, `sessionDiff.test.ts`).
  - **The parity dump is byte-identical** before and after: 7,821,406 bytes, compared with `cmp`. It is a scratch test,
    never committed, covering 12 plots × 5 themes, 600 entries in all. For each it holds:
    - the 40-robot roster baseline and the company baseline;
    - six dealt baselines, from nothing dealt to all four families with several picks;
    - the global audio settings and the BPM.

    The dump differs between themes, deals and plots, so it is sensitive to them.
  - **The cycle check** (a static graph of runtime imports over `src/`, type-only imports skipped, then strongly
    connected components) finds the same single component before and after: `AudioEngine` ↔ `lfoEngine` ↔
    `localeStore`. The module count went from 348 to 350. A planted value import from `robotFieldDerivation` to
    `spawnSystem` shows up as a second component, so the check sees a cycle when there is one.
  - **Checks:** types clean; lint 0 errors (the 4 old warnings); `npm test` 13,095 of 13,095 across 344 files (R12 added four).
  - **For R28:** two of its lines moved. "The deal's one family in v1" is now on `MelodyFields` in
    `robotFieldDerivation.ts`. The orphaned docblock at `spawnSystem.ts:359-362` is now the one above
    `generateAudioAttributes`.

- [x] **R15: `aspects.ts`, `Robot.ts`, `loadingIdentity.ts` — a family's picks typed by that family** (`a338371b`)

  **Description:** Picks and `Robot.loadedUnder` are typed by the union of every family's ids, so
  `{ melody: 'plucked' }` compiles and the readers re-check membership at run time. Type them as
  `{ [F in AspectFamilyId]?: AspectIdOf<F> }` (for a robot) and `{ [F in AspectFamilyId]?: AspectIdOf<F>[] }` (for a
  world). Fold `DealIdentity` (`spawnSystem.ts:835`, identical to `LoadingIdentity`) into it.

  **Proof:** RED test (types) — `src/data/bands/resolveBands.test.ts`: `// @ts-expect-error` over
  `{ melody: 'plucked' }` as `RobotAspects` and as `LoadingIdentity['aspects']`. That fails `npm run build:types`
  today, because the line compiles.

  **Acceptance criteria:**
  - [x] The run-time membership checks stay; they guard untrusted input.
  - [x] No new casts.

  **Verification:**
  - [x] `npm run build:types`, `npm run lint`, `npx vitest run src/data/bands` clean.

  **Dependencies:** R13.

  **Files:** `src/data/bands/aspects.ts`, `src/data/bands/loadingIdentity.ts`, `src/data/bands/dealAspects.ts`, `src/types/Robot.ts`, `src/data/bands/resolveBands.test.ts`

  **Estimated scope:** S

  **As shipped (2026-10-31, `a338371b`):**
  - **Two mapped types in `aspects.ts`.**
    - `FamilyAspects` (`{ [F in AspectFamilyId]?: AspectIdOf<F> }`) is a robot's. `RobotAspects` is now its alias, and
      it types `Robot.loadedUnder`, `resolveBands`' parameter, `describeLoadedUnder`'s parameter and the off screen's
      last-on record.
    - `FamilyPicks` (`{ [F in AspectFamilyId]?: AspectIdOf<F>[] }`) is a world's. It types `LoadingIdentity.aspects`,
      `SessionPayload.aspects`, `RetransmitInput.aspects`, the link's reader and the off screen's intent.
    - Every copy of the record is typed, not only the five files the plan listed, or the copies would no longer
      assign to each other.
  - **`DealIdentity` is folded** into `LoadingIdentity` (in `aspectDeal.ts` since R13).
  - **The helpers are generic in the family.**
    - `pickOrderOf`, `isAspectOf` and `canonicalPicks` return that family's ids. `canonicalPicks` now takes any strings,
      since it drops unknown ids at run time either way.
    - So the two existing `as AspectId[]` casts that fed it untrusted lists are gone: the link reader's in
      `worldLink.ts` and the family toggle's in `OffScreen.tsx`. That second one was R30's `OffScreen.tsx:361` item.
    - `canonicalAspects` writes each family through a private `canonicalInto<F>`, whose record parameter is mapped over
      `F` (`{ [K in F]?: AspectIdOf<K>[] }`). TypeScript 5.9 types a write through `FamilyPicks[F]` as every family's
      ids at once, so the record has to be mapped over the generic key for the write to check.
    - No cast was added in production code.
  - **`worldLink`'s `readAspects`** gathers the raw lists and hands them to `canonicalAspects`, instead of writing per
    family. The dev warning for a dropped pick is unchanged: it compares each family's kept count with its asked count.
  - **Not checked by the type (left as is):** writers that use a computed key over the family union still compile:
    `dealAspects`' `{ ...dealt.get(id), [family]: pick }` and the off screen's `[family]: next`. TypeScript does not
    check a computed union key against the per-family types. Their values come from `canonicalPicks(family, …)`, so
    they are right at run time. Checking them would need the same mapped-key helper.
  - **Tests.** The type test is a new case in `resolveBands.test.ts`. It has four `@ts-expect-error` lines (a robot's
    aspects, a world's lists, `Robot.loadedUnder`, `resolveBands`' parameter) and a full set of right ids for each. The
    RED was four unused directives. The cases that pass a bad id on purpose keep their run-time checks:
    - `dealAspects.test.ts`, `loadingStore.test.ts` and `worldTransition.test.ts` retarget their existing casts from
      `AspectId` to Melody's own id type. No cast was added.
    - `resolveBands`' and `describeWorld`'s other-family cases now carry a `@ts-expect-error` that says why.
    - `loadingStore.test.ts`'s two `canonicalPicks` calls lose their casts, since the function takes strings now.
    - `OffScreen.test.tsx`'s `setMelody` takes Melody's ids.
  - The run-time membership checks all stay: `canonicalPicks`, `describeLoadedUnder`'s `isAspectOf`, and `resolveBands`'
    `columnOf`.
  - **Type mutants (under `tsc`), 4 of 4 died:** a robot's aspects typed by the union again; a world's lists typed by
    the union again; `loadedUnder` typed by the union again; a robot's aspects made too tight to hold any id (the
    right-id controls fail, and so do real tests' literals).
  - **Checks:** types clean; lint 0 errors (the 4 old warnings). `npx vitest run src/data/bands src/utils
    src/stores/loadingStore.test.ts src/systems/worldTransition.test.ts src/systems/spawnSystem.test.ts
    src/components/panels/screen/screens` passes 2,710 of 2,710 in 58 files.

- [x] **R16: reuse two existing rules** (`5e94f48b`)

  **Description:**
  - `worldChange.ts:21-24` re-implements `prefersReducedMotion()`. Import it from `src/utils/reducedMotion.ts`, which
    already exports it (five modules use it).
  - The drawer's no-op guard (`SectorSettingsDrawer.tsx:90`) duplicates `resolveRetransmitAction`'s no-op
    (`worldTransition.ts:195`). Export `retransmitChangesWorld(input)` from `worldTransition.ts` and use it there.

  **Proof:** RED test — `src/systems/worldTransition.test.ts`: `retransmitChangesWorld` is false for `{}` and for an
  equal loading, true for a coordinate. The reduced-motion reuse is a refactor: existing tests pass unmodified.

  **Acceptance criteria:**
  - [x] One definition of each rule.

  **Verification:**
  - [x] `npx vitest run src/systems src/components/panels/screen/console`; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** R7.

  **Files:** `src/systems/worldChange.ts`, `src/systems/worldTransition.ts`, `src/components/panels/screen/console/SectorSettingsDrawer.tsx`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** XS

  **As shipped (2026-10-31, `5e94f48b`):**
  - **`retransmitChangesWorld(input)`** is `resolveRetransmitAction(input).mode !== 'noop'`: it asks, and writes
    nothing. The drawer's guard calls it. The drawer only ever sends a name or a plot, so its behaviour is unchanged:
    an emptied name is still no change.
  - **The tests.** Three cases: the no-change inputs (none at all, an emptied name, the loaded theme again, an equal
    pick set out of order and duplicated); the changing ones (a coordinate, a name, a theme, a pick); and that it writes
    no store. The RED was "not a function".
  - **Beyond the Files list:** `SectorSettingsDrawer.test.tsx` mocked `worldTransition` with `retransmitWorld` alone,
    so the drawer's new call had nothing to reach. Its mock now spreads the real module (`importOriginal`) and stubs
    only `retransmitWorld`. That way its two no-op cases pin the drawer to the real rule, not to a copy.
    `SettingsScreen.panels.test.tsx` mocks the module too but never presses Retransmit; it passes (5 of 5).
  - **`worldChange.ts`** imports `prefersReducedMotion` from `utils/reducedMotion.ts`, and its own copy and query
    constant go. The shared one also checks `typeof window`. `worldChange.test.ts` passes unmodified.
  - 4 of 4 mutants died: the rule says everything changes the world; the rule forgets the loading; the drawer drops
    its guard; the request module never sees reduced motion.
  - **Checks:** `npx vitest run src/systems src/components/panels/screen/console` 2,759 of 2,759 in 36 files; types
    clean; lint 0 errors (the 4 old warnings).

- [x] **R17: one canonical link writer for the bar and Share** (`f4347e56`)

  **Description:** `encodeWorldLink` (`worldLink.ts:130-135`) and the mirror's `withParam` chain
  (`sessionShareUtils.ts:94-100`) write the same link two ways. The bar appends a new param in edit order (Voice can
  precede Melody) and writes the name as `%20`; Share writes `+`. `withParam` matches raw names, so `?se%65d=foo` reads
  as the seed but a later mirror appends a second `seed`. Build the mirror's seed-to-families part from the encoder
  that Share uses, then keep the non-world params (`debug`, `load`) and the hash, as now.

  **Proof:** RED test — `src/utils/sessionShareUtils.test.ts`: after a mirror, the bar's world params equal
  `buildShareUrl`'s for the same world, in the same order.

  **Acceptance criteria:**
  - [x] One world, one link, in the bar and in Share.

  **Verification:**
  - [x] `npx vitest run src/utils`; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** R9.

  **Files:** `src/utils/sessionShareUtils.ts`, `src/utils/worldLink.ts`, `src/utils/sessionShareUtils.test.ts`

  **Estimated scope:** S

  **As shipped (2026-10-31, `f4347e56`):**
  - **One writer.** `worldLink.ts` now has `encodeWorldIdentityParams(identity)`: `seed`, `x` and `y`, then `theme` and
    the families when they are not the default. It is the old first half of `encodeWorldLinkParams`, which now builds
    on it and adds `s`.
  - **One text.** `worldLinkQuery(params)` is the params' text with the commas plain. Before, that `%2C` swap lived
    inside `buildShareUrl`; both Share and the bar now call it.
  - **The mirror** drops the `withParam` chain:
    - It walks the bar's raw parts. A part is a world param when the name the browser reads (`URLSearchParams` on that
      part) is a link param or a family, so `se%65d=…` counts as the seed.
    - It writes the world part in place of the first world param, or after the other params when the bar held none,
      as `withParam` appended a new param.
    - Every other part keeps its own text and its order, and the hash stands.
    - The no-op check ("the bar already names this world, however encoded") is unchanged.
  - **Behaviour change, by design:** the bar spells the name as Share does, `Pelagos+7%21` where it wrote
    `Pelagos%207!`. Five existing mirror cases pinned the old spelling and now pin the new one. They are the theme and
    families case, the every-family case, the stale-loading case, the blob case and the unrelated-params case; their
    order and kept params are unchanged.
  - **New cases:**
    - the bar's world params equal `buildShareUrl`'s for the same world, in order and spelling, from a bar that held
      Voice ahead of Melody;
    - the world part sits where the first world param stood;
    - `?se%65d=old` leaves one seed;
    - a bar with no world param gets the world part after its own params.
  - **Docs:** `SESSION_STORAGE.md`'s mirror sentence names the shared encoder, and the spec's assumption 12 has an R17
    amendment. The spec's survey and `SHORT_WORLD_LINK.md` are left as written.
  - **For R30:** the mirror no longer calls `encodeURIComponent`, and `URLSearchParams` writes U+FFFD for a lone
    surrogate instead of throwing (checked in Node). So R30's `URIError` path out of `retransmitWorld` is gone too.
  - 6 of 6 mutants died:
    - the bar skips `worldLinkQuery`;
    - a world param matched by its raw name;
    - the world part always last;
    - the world part always first;
    - the families not counted as world params;
    - Share's encoder drops the loading.
  - **Checks:**
    - `npx vitest run src/utils`: 1,613 of 1,613 in 44 files;
    - the other files that read the bar (`worldTransition`, `sessionDiff`, `worldBoot`, `audioBudgetSystem`,
      `OffScreen`, `worldIdentity`): 684 of 684;
    - types clean; lint 0 errors (the 4 old warnings).

- [x] **R18: `powerController.ts` — a second "on" press after the resume does nothing** (`ba705262`)

  **Description:** The rocker stays clickable through its sequence (`PowerRockerSwitch.tsx:172-181`; `isTransitioning`
  only colours the light). A second click whose act lands after the first resume finds `'running'` and re-runs the cold
  branch: every voice released and rebuilt mid-music, the harmony reset, the loop restarted. `main` behaved the same.
  After the fade, `powerOnSequence` returns when `getWorldState() === 'running'`.

  **Proof:** RED test — `src/systems/powerController.world.test.ts`: the double-press case (`:129-144`) changes to
  expect no second start (no second `reRegisterAllRobotsAudio`).

  **Acceptance criteria:**
  - [x] Two "on" presses in a row start once.

  **Verification:**
  - [x] `npx vitest run src/systems/powerController.world.test.ts src/systems/powerController.test.ts`

  **Dependencies:** R1.

  **Files:** `src/systems/powerController.ts`, `src/systems/powerController.world.test.ts`

  **Estimated scope:** XS

  **As shipped (2026-10-31, `ba705262`):**
  - After the fade, `powerOnSequence` returns when the world is `'running'`, as planned. The comment above it says
    why.
  - **Tests in `powerController.world.test.ts`:**
    - the double-press case now expects one start: `AudioEngine.start`, the voice re-registration, the work loop and
      the swells once each, one lifecycle tick never unsubscribed, and the world running;
    - a case after a pause: two presses resume once and re-register nothing;
    - a case for the placement: it holds the second press's fade (a spy on `fadeOffScreen`) until the first press has
      started the world, and expects one start.
    The RED was the first two. The third passes with the guard where the plan puts it, after the fade.
  - 2 of 2 mutants died: no running check; the check moved before the fade (only the placement case kills that one).
  - **Found, not fixed (Crawford's call).** Two presses can both pass the check when both fades end before the first
    press's start resolves. A scratch test held `AudioEngine.start` open and found two starts and two re-registrations.
    - **When it happens:** a press within about 0.4 s of the first kills the first fade (`setTimeline` replaces it), so
      only one press goes on. A press later than that whose fade ends while the first start still waits does
      double-start. That window is open only while a start runs longer than the gap between the presses (a slow first
      start on a phone).
    - **Two fixes, with different UX:**
      - the controller joins a start already under way (an in-flight promise);
      - the rocker takes no click while `isTransitioning`, since today the flag only colours its light.
  - Checks: the two named files plus `src/components/ui/physical` (the rocker), 73 of 73 in 5 files; types clean; lint 0
    errors.

- [x] **R19: the off screen takes no tap it cannot show** (`1e1823f1`)

  **Description:**
  - The boot theatre's dark layer is `pointer-events: none` (`OffScreen.css:59`), so a tap in the 0.5 s dark phase
    activates the unseen control under it. Let the layer take the tap while it is up; the root's `onPointerDown` still
    skips the theatre.
  - `fadeOffScreen` (`offScreenTheatre.ts:80-89`) makes the root `inert` while it fades, so the transparent screen
    takes no input during a slow first start.
  - If `start()` rejects, `powerOnSequence` restores the screen (opacity 1, not inert) instead of leaving it invisible
    and mounted.

  **Proof:**
  - **Look**, for the CSS: a tap in the dark phase selects nothing.
  - **RED test**, `src/animation/offScreenTheatre.test.ts` and `src/systems/powerController.test.ts`: the root is
    `inert` once the fade starts, and a rejected `start` restores it.

  **Acceptance criteria:**
  - [x] No invisible control is clickable.
  - [x] A failed start leaves a usable off screen.

  **Verification:**
  - [x] `npx vitest run src/animation/offScreenTheatre.test.ts src/systems/powerController.test.ts`; the Look recorded.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/screens/OffScreen.css`, `src/animation/offScreenTheatre.ts`, `src/systems/powerController.ts`, their tests

  **Estimated scope:** S

  **As shipped (2026-10-31, `1e1823f1`):**
  - **The dark layer** loses `pointer-events: none`, so it takes the tap while it is up. The tap still bubbles to the
    root, whose `onPointerDown` skips the theatre. The layer ends `visibility: hidden`, so it takes nothing after.
  - **`fadeOffScreen`** sets the root's `inert` attribute as the fade starts. The screen is unmounted when the power
    flag flips, so nothing has to clear it on success.
  - **New `restoreOffScreen()`** in `offScreenTheatre.ts`: kill the fade, `gsap.set` the root back to opacity 1, and
    remove `inert`; with no screen mounted it does nothing. `powerOnSequence` wraps `await this.start()` and calls it on
    a rejection, then rethrows. The failure stays the caller's, as before; the rocker's `void handlePowerOn()` still
    logs it.
  - **Tests:**
    - `offScreenTheatre.test.ts`: the screen is inert as the fade starts; the restore kills the fade, sets opacity 1 and
      removes `inert`; the restore with no screen.
    - `powerController.test.ts`: a rejected start restores the screen after its fade and leaves the world cold with the
      power off; a start that succeeds, and a resume, never restore. Its theatre mock gains `restoreOffScreen`.
  - 6 of 6 mutants died:
    - the fade leaves the screen taking input;
    - the restore leaves it inert;
    - the restore leaves it transparent;
    - the restore leaves the fade running;
    - a failed start does not restore;
    - a failed start is swallowed.
  - **The Look, measured headless** (dev server on 5191, 1600 × 900, a fresh page with the heard-a-world flag, a real
    click). The A/B ran against HEAD's three files in the same session:
    - **The dark phase:** a tap where the Vessport Null row sits, 23 ms after the layer was seen opaque. With R19 the
      theatre skips (the layer hidden), the row stays unchecked and the wash stays `clear`. At HEAD the same tap
      picked Vessport Null (`aria-checked` true) and raised the wash (`covering`).
    - **The fade:** frames sampled from the power-on click. With R19 the root is `inert` from the first fading frame
      (208 ms, opacity 0.92) to the last before it unmounts (1,048 ms, opacity 0). At HEAD it was never inert.
    - Crawford can try the tap by hand: it should skip the theatre and pick nothing.
  - **Docs:** `ANIMATION_SYSTEM.md`'s theatre bullet, `UI_SHELL.md`'s veil-and-theatre bullet, and an R19 amendment to
    the spec's assumption 18. `AUDIO_SYSTEM.md`'s `powerOnSequence` row gains R18's running case and R19's restore.
    That row also still listed the cold path's `AudioEngine.resume()`, which R1 removed, so it now says what R1 did
    instead.
  - **Checks:** the two named files 34 of 34. Every off-screen, rocker, viewport, tablet, power-world and animation test:
    949 of 949 in 37 files. Types clean; lint 0 errors.

- [x] **R20: Comms Save marks the save loaded; Keep becomes "Save Last World" and survives a storage failure** (`66f5d85d`)

  **Description:**
  - `SessionsPanel`'s `handleSave` (`SessionsPanel.tsx:54-64`) never sets `currentLoadedSessionName`, so the off screen
    reads dirty right after a Comms save. Set it, as Keep does.
  - **Keep's label becomes "Save Last World"** (Crawford, 2026-10-31, Open Question 6). It was "Save the last session",
    his own words from the revisions' note 2. The label lives at `home.ts:29` (`home.off.keep`), and the case at
    `OffScreen.test.tsx:1046` pins it, so update that case. `OffScreen.tsx:139`'s comment quotes it too.
  - `onKeep` (`OffScreen.tsx:334-338`) has no failure path: a quota error throws into the click. Catch it and show a
    line. That line still needs Crawford's words. Until then it is a stand-in in the label's voice, for example
    "Couldn't save the last world.", under `home.off.keepFailed` and marked as a stand-in in `home.ts`.

  **Proof:**
  - **RED test**, `src/components/panels/screen/console/SessionsPanel.test.tsx`: after a save, `isWorldDirty()` is
    false.
  - **RED test**, `OffScreen.test.tsx`: with `saveNamedSession` throwing, Keep shows the line and the screen stays up.
  - **Read**, for the label (copy only).

  **Acceptance criteria:**
  - [x] The dirty read agrees with what was just saved.
  - [x] A storage failure is visible, not a crash.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console src/components/panels/screen/screens/OffScreen.test.tsx src/content`

  **Dependencies:** R6.

  **Files:** `src/components/panels/screen/console/SessionsPanel.tsx`, `src/components/panels/screen/screens/OffScreen.tsx`, `src/content/copy/home.ts`, their tests

  **Estimated scope:** S

  **As shipped (2026-10-31, `66f5d85d`):**
  - **Comms' Save**, once the write succeeds, sets `currentLoadedSessionName` and `currentSessionName` to the trimmed
    name, as Keep does. The plan named the loaded name only. With both set, a padded field cannot leave the loaded
    name and the field disagreeing, which would steer `detachLoadedSession`'s re-suggestion wrong. A refused Save
    changes neither.
  - **Keep's label** is "Save Last World" (`home.off.keep`). `OffScreen.tsx`'s comment and the test that pins the
    label follow. The three docs that quote the old label wait for R32, whose "After R20" list names them:
    `docs/specs/OFF_SCREEN.md:235` (the plan said `:197`), `docs/UI_SHELL.md:83` and roadmap 57's summary.
  - **Keep's failure.** `onKeep` catches what `keepCurrentWorld` throws and logs it.
    - The line it shows, `home.off.keepFailed`, "Couldn’t save the last world.", is a stand-in marked in `home.ts`.
      It still needs Crawford's words.
    - It takes the unsaved warning's own slot and class, with `role="alert"`. Keep fails only while the world is
      unkept, when that warning shows, so nothing moves.
    - The line goes when a Keep succeeds, or when the world changes: a realised world change, or a family toggle.
      The world it names is then no longer the one shown.
    - The store is untouched on a failure, since `keepCurrentWorld` writes nothing before the save.
  - **Tests:**
    - `SessionsPanel.test.tsx`: after a Save, `isWorldDirty()` is false; a padded name loads trimmed, and the field
      follows; a refused Save leaves the loaded save as it was. The RED was the first two; the third is a guard and
      passes before. The block gives `buildSessionPayload` one stable payload and puts the file's counting default
      back after.
    - `OffScreen.test.tsx`: the refused Keep's line is an alert in the warning's place, logged, with the screen up
      and Keep lit; it goes on a later good Keep, on a family toggle, and on a preset pick. The RED was the absent
      line, once the copy existed.
  - 9 of 9 mutants died:
    - the Save does not mark the save loaded;
    - the Save loads the untrimmed name;
    - the Save leaves the field padded;
    - the Save marks the save loaded before it is written;
    - Keep lets the throw out;
    - the line survives a good Keep, a toggle, or a realised change (three mutants);
    - the line is not announced.
  - **Checks:** the named run, 741 of 741 in 13 files; types clean; lint 0 errors.

- [x] **R21: `sceneWash.ts` — the wash keeps its colour on a re-cover** (`ec390c40`)

  **Description:** `'covering'` repaints the gradient every time (`sceneWash.ts:83-85`). A request during `'uncovering'`
  therefore swaps the old hour's colours for the new world's under a partly opaque wash. Paint only when the wash was
  `'clear'`.

  **Proof:** RED test — `src/animation/sceneWash.test.ts`: covering → covered → uncovering → covering sets the gradient
  once.

  **Acceptance criteria:**
  - [x] No colour jump on a quick second world change.

  **Verification:**
  - [x] `npx vitest run src/animation/sceneWash.test.ts`

  **Dependencies:** None.

  **Files:** `src/animation/sceneWash.ts`, `src/animation/sceneWash.test.ts`

  **Estimated scope:** XS

  **As shipped (2026-10-31, `ec390c40`):**
  - The subscriber keeps the state it last acted on, and `'covering'` paints the gradient only when that was
    `'clear'`. A re-cover while uncovering, whether or not the fade-out has started, fades back up in the colours
    already shown.
  - **Tests (`sceneWash.test.ts`):**
    - covering → covered → uncovering → covering paints once, in the first hour's colours, though the hour moved in
      between;
    - a re-cover before the fade-out's frame paints nothing either;
    - a cover from clear is painted every time: after a whole cycle, and after a reduced-motion snap to clear.

    The RED was the first two; the third is a guard and passes before.
  - 3 of 3 mutants died: every cover painted; none painted; only a re-cover painted.
  - **Docs:** the wash bullet in `ANIMATION_SYSTEM.md`, and the module's own header comment.
  - **Checks:** `sceneWash.test.ts` with `WorldView.test.tsx`, 36 of 36; types clean; lint 0 errors.

- [x] **R22: `worldTransition.ts` — a theme change keeps the hour** (Crawford: keep it, Open Question 4) (`11ab2303`)

  **Description:** `rebuildCurrentLocaleInPlace` (`worldTransition.ts:245-251`) goes through `buildLocale`
  (`:72-84`), which stamps a fresh `dayStartTimestamp`, so every theme change snaps the sky to the plot's arrival hour
  (hidden by the wash). After R33 a family change no longer rebuilds; only a theme change, or a name change carrying a
  loading, reaches the in-place rebuild. Carry the current locale's `dayStartTimestamp` into it. A move to another plot
  still stamps a fresh one.

  **Proof:** RED test — `src/systems/worldTransition.test.ts`: a theme retransmit keeps `dayStartTimestamp`; a
  coordinates retransmit does not.

  **Acceptance criteria:**
  - [x] The wall-clock day guardrail holds: the day stays a fixed `DAY_DURATION_MS` from the locale's
        `dayStartTimestamp`.

  **Verification:**
  - [x] `npx vitest run src/systems/worldTransition.test.ts`

  **Dependencies:** R1, R33.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** XS

  **As shipped (2026-10-31, `11ab2303`):**
  - **The code.** `buildLocale` takes an optional `dayStartTimestamp`, and `retransmitCoordsOnly` passes one through.
    `rebuildCurrentLocaleInPlace` hands in the current locale's, which covers both of its callers: a theme change
    (`loadingOnly`), and a name change carrying a loading. Every other path still stamps from `Date.now()` and `x`:
    a plot move, Roll, a Load, and a theme riding on a plot move. The day is computed as before, a fixed
    `DAY_DURATION_MS` from the one timestamp, so the guardrail holds.
  - **Tests (`worldTransition.test.ts`, with `Date.now` moved on 25 hours).** A theme retransmit keeps the timestamp,
    and so does a name change carrying a theme. A coordinates retransmit stamps `now − x/24 day`, and so does a theme
    riding on a plot move. The RED was the first two; the plot-move pair are guards and pass before.
  - 3 of 3 mutants died: the rebuild hands no hour over; `buildLocale` ignores it; a plot move keeps the old plot's
    hour.
  - **Docs:** a sentence in `BUILDING_DESIGN.md`'s Day/Night section on when the timestamp is stamped and when it
    carries over, and an R22 amendment to the spec's assumption 10.
  - **Found for R32 (added to its list):** R15 left the spec's interface listings, `SESSION_STORAGE.md:186` and
    `COMPANIES.md:33` naming the old union record type.
  - **Checks:** `worldTransition.test.ts` 103 of 103; types clean; lint 0 errors.

- [x] **R23: `worldLink.ts` — coordinates bounded at the link** (`ff9848d3`)

  **Description:** `x` and `y` accept any digit string (`worldLink.ts:110-115`), as on `main`. `Number('9'.repeat(400))`
  is `Infinity`, which makes a NaN `dayStartTimestamp`, and the mirror now writes it back. Accept safe integers within
  the range Foundry's coordinate inputs allow; anything else reads as absent, as a malformed part does now.

  **Proof:** RED test — `src/utils/worldLink.test.ts`: a 400-digit `x` decodes as absent.

  **Acceptance criteria:**
  - [x] Every link the app writes still decodes.

  **Verification:**
  - [x] `npx vitest run src/utils/worldLink.test.ts src/utils/worldLinkBoot.test.ts`

  **Dependencies:** None.

  **Files:** `src/utils/worldLink.ts`, `src/utils/worldLink.test.ts`

  **Estimated scope:** XS

  **As shipped (2026-10-31, `ff9848d3`):**
  - **The link.** `readCoordinate` keeps its digit-string rule and adds `Number.isSafeInteger`. A string past
    ±(2⁵³ − 1) reads as absent, so that axis is random and the rest stand, as a malformed part does.
  - **The premise didn't hold.** The plan's bound was "the range Foundry's coordinate inputs allow", but `CoordsInput`
    has none: it rounds any number. Bounding the link alone would break the acceptance. A 17-digit x typed in Foundry
    round-tripped before, and after the link change it would read as absent.
  - **So, beyond the Files list,** `CoordsInput` takes the same bound. Its two handlers share a new `coordinateOf(raw)`
    (blank, NaN, round, safe integer); its comments' reasons are kept. An entry past the safe integers is ignored, as
    a non-number is. Each plot Foundry can send is now one its link decodes. A Foundry-typed 1e30, which writes
    `x=1e+30`, never decoded, before or after; the input now refuses it.
  - **Tests:**
    - `worldLink.test.ts`: a 400-digit x, an x of 2⁵³ and a 400-digit negative y each read as absent; the safe ends
      read as given.
    - `CoordsInput.test.tsx`: entries past the safe integers are ignored on both axes; the ends pass.

    The RED was the absent-axis cases, and the input's ignore case. The two end cases are guards.
  - 5 of 5 mutants died:
    - the link: no bound; a finite check instead of the safe-integer one; the ends excluded;
    - the input: no bound; a bound looser than the safe integers.
  - **Docs:** `PROCEDURAL_GENERATION.md`'s fallback line and `SESSION_STORAGE.md`'s link table say a coordinate past
    the safe integers is random.
  - **Checks:** the two named files plus `sessionShareUtils.test.ts`, then with `CoordsInput` and the drawer, 137 of 137;
    types clean; lint 0 errors.

- [x] **R24: `AudioEngine.ts` — the resume fallback the comment promises** (`4ac9633f`)

  **Description:** `AudioEngine.ts:1531-1533` says powerController "falls back to a cold start when the world does not
  come back". Nothing does: `resume()` returns `void`, and `powerController.resume()` is unconditional. Whether a long
  pause on iOS Safari refuses the resume is unmeasured.
  - **Default:** correct the comment to what happens (the rejection is logged), and add a backlog item: "a 10-minute
    pause on iOS Safari; read `rawContext.state` after the resume; build the fallback if it stays suspended". This
    follows the finish-the-branch rule.

  **Proof:** Read.

  **Acceptance criteria:**
  - [x] The comment matches the code.
  - [x] The backlog item exists.

  **Verification:**
  - [x] Manual review.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts` (comment), `docs/todo/backlog.md`

  **Estimated scope:** XS

  **As shipped (2026-10-31, `4ac9633f`):**
  - **The comment** on `AudioEngine.resume()` now says what happens. A rejected resume is logged in dev builds only
    (`devWarn`), and nothing falls back. `powerController.resume()` is unconditional (read in `powerController.ts`), so
    the world reads `'running'` over a context that may still be suspended. It points at the backlog item.
  - **Backlog 42**, "Does a Long Pause on iOS Safari Come Back? (Measure First)". It holds the plan's measurement (10
    minutes off on an iPhone, screen on and locked; read `rawContext.state` after the resume), then the fallback to
    build if the context stays suspended: a retry of `resume()` inside the gesture first, else a teardown and a cold
    start. 42 is the next free number: the archive's highest is 41, and no branch uses a higher one. `plan.md` is not
    touched, since where it goes in the order is Crawford's call.
  - **Beyond the Files list:** one sentence in `AUDIO_SYSTEM.md`'s "Power is a pause" paragraph says nothing falls back
    yet, and links item 42.
  - **Proof:** Read. The code reads as the comment now says. Crawford's Read is Checkpoint D's.

- [x] **R25: the chooser's accessible names, and focus on its selected row** (Crawford: the selected row, Open Question 5) (`fda61552`)

  **Description:**
  - **Names.** The list row's `aria-label={option.humanLabel}` (`RadioButton.tsx:222`) drops the "Current" eyebrow, so
    a screen reader never learns which row is Current. When a row has a `loreLabel`, name it with both.
  - **Focus.** The `role="status"` readout (`OffScreen.tsx:412`) mounts already filled, so nothing announces the
    chooser. When the chooser mounts after a power-off, focus moves to the Transmission list's selected row (Current
    unless a pick is pending). The mount effect tells a power-off from a fresh page by the world state:
    `getWorldState() === 'paused'` after a power-off, `'cold'` on a fresh page. `pause()` writes `'paused'` in the same
    call that flips the power flag, before React mounts the screen.
  - A fresh page and a first visit (the hint only, with no rows) move no focus. The readout keeps its status role for
    later changes.

  **Proof:**
  - **RED test**, `src/components/ui/controls/RadioButton.test.tsx`: a list option with a `loreLabel` is named by both.
  - **RED test**, `src/components/panels/screen/screens/OffScreen.test.tsx`: mounted with the world `'paused'`, the
    selected row has focus; mounted `'cold'`, focus stays where it was.

  **Acceptance criteria:**
  - [x] Current is named as Current.
  - [x] A power-off puts keyboard and screen-reader focus on the selected row; a page load does not steal focus.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/RadioButton.test.tsx src/components/panels/screen/screens/OffScreen.test.tsx`
  - [x] Probe: real keys after a power-off. The selected row has focus; Tab and Shift+Tab work as R8 left them.

  **Dependencies:** R8.

  **Files:** `src/components/ui/controls/RadioButton.tsx`, `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/ui/controls/RadioButton.test.tsx`, `src/components/panels/screen/screens/OffScreen.test.tsx`

  **Estimated scope:** S

  **As shipped (2026-10-31, `fda61552`):**
  - **Names.** A `list` row with a `loreLabel` is named `"<lore>, <label>"` ("Current, kr1nd4ra · (12, 68)"); the comma
    gives a screen reader its pause. Only the list joins the lore, as the plan scoped it. The cabinet and muted
    options keep the human label alone, and a test pins that. The face is unchanged: the lore line over the label.
  - **Focus.** A mount effect in `OffScreen` reads `getWorldState()`. When the world is `'paused'`, it focuses the
    list's checked radio (`.sc-radio-button--list [role="radio"][aria-checked="true"]`).
    - The plan also guarded on `heardWorld`. Its mutant survived: a first visit renders no rows, so the query finds
      nothing. So the guard was deleted (fix the test or delete the code), and the comment keeps the reason.
    - At mount nothing can be pending, since the intent is the screen's own state. The selected row is therefore
      always Current there, and it is the list's first radio. A "focus the first radio" mutant would be equivalent.
      The selector names the selected row anyway, as the plan words it.
  - **Tests:**
    - `RadioButton.test.tsx`: a lore row is named by both and still draws its two lines; an option in the other
      appearances keeps its label alone. Six list cases pinned the old name of their Current-like row, and now pin
      the new one. One of them had used the name as the label's text and now reads the label itself.
    - `OffScreen.test.tsx`, a new describe:
      - mounted paused, the focus is on Current, named as Current and inside the Transmission group;
      - mounted cold, the focus stays where it was;
      - a first visit moves no focus;
      - the readout keeps `role="status"`.
    - The RED was the paused case and the naming case.
    - The file's other cases now find Current through `currentName()` and `asCurrent()` (the eyebrow, a comma, the
      label). Two scripts made those swaps, each pattern checked for its exact count: 38 sites. `currentLabel` stays
      as the readout's text.
  - 4 of 5 mutants died: the row named by its label alone; the lore joined in every appearance; focus moved on a cold
    mount too; no focus at all. The fifth, the first-visit guard dropped, survived, and the guard is gone.
  - **Probe** (dev server on 5191, 1600 × 900, real clicks and keys):
    - a fresh page leaves the focus on the body;
    - power on, then a real Power off click: the focus is on "Current, kr1nd4ra · (12, 68)", checked, with the world
      `'paused'`;
    - Tab: Roll, Save Last World, the theme row (Classic);
    - Shift+Tab back: Save Last World, Roll, Current, then out of the list to Power on. This is R8's order.
  - **Docs:** `COMPONENT_LIBRARY.md`'s list paragraph (the name) and `UI_SHELL.md`'s two-axes bullet (the name and the
    focus).
  - **Checks:**
    - the named run, 219 of 219;
    - `src/components/panels`, `src/components/tablet`, `src/components/ui` and the power-world test: 2,666 of 2,666
      in 87 files;
    - types clean; lint 0 errors.

- [x] **R26: verify first — five reviewer findings nobody has measured** (`5da0ce43`, `8d1f2ae1`, `17f98363`, `0929d592`)

  **Description:** Each item gets a measurement recorded here. A confirmed item becomes its own fix commit, with the
  proof named below; a refuted one is closed here.
  1. **The deck camera behind the off screen.** Its `tick` (`deckCamera.ts:376`) runs on `performance.now()`, and a
     float is created paused, then played (`:283`, `:310-311`), which slips past the paused-on-arrival guard.
     - Measure: at 375 × 812, on, then off; watch the deck scroller's `scrollLeft` for 60 s.
     - If it moves: gate the tick on `getWorldState()` (RED test in `deckCamera.test.ts`), and correct
       `ANIMATION_SYSTEM.md:52`'s claim that a robot re-rendering while off does not start swimming.
  2. **The blur at the fade's start.** `fadeOffScreen` tweens the root's opacity, which may make the root a backdrop
     root, so the veil's 3 px blur drops out on the fade's first frame.
     - Measure: slow `gsap.globalTimeline` and watch.
     - If it pops: fade the veil and the column separately (Look).
  3. **Layout shifts at 375 px.** A description line reserves `2.6em` (`OffScreen.css:157`) where two lines at
     `line-height: 1.5` take 3em. The warning line (`OffScreen.tsx:415`) mounts with no reserved height and re-centres
     the column.
     - If either moves a control: reserve the height (Look; the hold-largest-size rule).
  4. **Contrast.** The footer (`rgba(200, 220, 230, .38)` at 9 px, `OffScreen.css:78`) and the descriptions (0.6 alpha
     at 12 px) over the veil.
     - Compute against the veil's lightest backdrop. Any change is Crawford's (Look).
  5. **The wash while fading.** `npm run perf:trace` across a powered-on Retransmit with audio running: rastered screens
     per frame over the two fades.
     - A/B against `will-change: opacity` set at `'covering'` and cleared at `'clear'`.

  **Proof:** per item, as above.

  **Acceptance criteria:**
  - [x] Each of the five has a recorded result.

  **Verification:**
  - [x] The probes and Looks recorded under this task.

  **Dependencies:** R1 (item 1 is measured on the fixed pause).

  **Files:** none until an item is confirmed

  **Estimated scope:** M (five measurements)

  **As shipped (2026-10-31):** four of the five confirmed, each fixed in its own commit (R26.1, R26.2, R26.3, R26.5);
  item 4 recorded for Crawford. All headless, on the dev server on 5191.
  1. **The deck camera: confirmed, fixed (R26.1, `5da0ce43`).** Phone shell, on then off.
     - gsap's ticker does not pause, so the camera's loop ran on behind the off screen. A follow timed out on the wall
       clock, the next pick floated, and the float's `'world'` timeline played from 0 to 1 under the pause.
     - It is built `{ paused: true }` and played after `setTimeline`, so the paused-on-arrival guard, which pauses only
       a timeline already playing, let it through. The scroller held in four runs only because the picked robot sat
       where the camera already was.
     - The tick now does nothing while the world is paused. RED test in `deckCamera.test.ts`, mutants 2/2. Re-probe: a
       power-off in the camera's rest leaves no float timeline and no pick.
     - `ANIMATION_SYSTEM.md`'s claim that a re-rendering robot cannot start swimming under the pause is corrected.
     - **Finding for Crawford:** the guard misses every timeline built paused and played after registration: the
       swims, the work loop's dissolve and work moves, and the station ripples too. Nothing starts those while the
       world is paused today, so only the camera is gated, as this item scoped it.
  2. **The blur at the fade's start: confirmed, fixed (R26.2, `8d1f2ae1`).** The app's GSAP slowed 50×; a sharpness
     score (mean |Laplacian| of luminance) over a strip of world beside the column.
     - Before the fix: 0.109 before the click, 2.04 at the fade's first reading (veil opacity 0.996). The root's
       opacity made it a backdrop root, and the veil's blur dropped out on that frame.
     - The fade now tweens the root's parts (the veil, the dark layer and the column), never the root; R19's
       `restoreOffScreen` brings them back and leaves the dark layer hidden. RED tests, mutants 3/3.
     - Re-measure: 0.124 at 0.997, then a smooth rise (0.85 at 0.83, 2.34 at 0.49).
  3. **Layout shifts: confirmed, fixed (R26.3, `17f98363`).**
     - **Descriptions.** At 375 × 812, a sentence that wrapped to a second line grew its line from 31.2 px (`2.6em`)
       to 36 px and moved every row under it 4.8–4.9 px (Melody's Hypnotic moved Envelope's Plucked, and on down). At
       320 every sentence already takes two lines, and at 1600 one, so nothing moved there.
     - **Every sentence, at 13 widths from 320 to 1920:** at most two lines. The unsaved warning takes two lines on a
       phone up to 414 px and one elsewhere; the Keep failure line takes one everywhere.
     - **The warning.** On a desk where the column fits and is centred (1920 × 1080, 2560 × 1440), its mount
       re-centred the column and moved every control 15 px. At 1600 × 900 and 768 × 1024 the column overflows and
       starts at the top. On the phone it pushed only the footer, 48 px.
     - **The fix.** A description holds two lines: `3em`, with its `line-height: 1.5` set. The warning line is always
       rendered, empty while the world is kept, and holds one line on the desk and two on the phone. The Keep failure
       is an alert `span` inside it.
     - **Re-measure:** all twelve aspects and five themes toggled at 375 and 320 move nothing. The warning's mount moves
       nothing at 1920, 2560, 768, 375 or 320, the footer included. Keep still moves the rows under the save it adds
       (49 px), which is the list growing.
     - **Look (screenshots):** both states on the desk and the phone; the readout and the footer stay put, and the
       held lines read as spacing. Crawford's Look is Checkpoint D's.
  4. **Contrast: recorded; any change is Crawford's.** Each text was made transparent and the backdrop shot behind it
     (the veil over the blurred world). The text's own colour was composited over that backdrop for a WCAG ratio.
     - Coverage: the desk at 1920 × 1080 at hours 0, 9, 12 and 15 over the three presets' worlds and another plot; the
       phone at 375 × 812 at noon over four worlds.
     - **Footer** (`rgba(200, 220, 230, .38)`, 9 px): 2.2–2.9:1 over every backdrop, median 2.82–2.87. It never reaches
       3:1. Over the veil on pure black its ceiling is about 2.8:1, and over the veil on white it is 1.6:1. Reaching
       4.5:1 needs about 0.55 alpha over a typical backdrop.
     - **Descriptions** (0.6 alpha, 12 px; the warning line shares both): median 5.05–5.38:1, which passes AA. Over the
       lightest pixel behind them it is 4.0–4.9 typically. Where a bright patch of world sits behind the theme line
       (Halcyon Drift at noon, backdrop `rgb(106, 109, 98)`), it is 2.35:1, and 2.8 at the 95th percentile. Over the veil
       on white: 2.06.
  5. **The wash while fading: confirmed, fixed (R26.5, `0929d592`).** Desk 1600 × 900, audio running (the realtime
     context advanced every round).
     - **Method.** One powered-on Retransmit a round, through the drawer's own call. `rastered screens/frame`
       (`paint-area-lib.mjs`) was read over [covering, covered] and [uncovering, clear], from `console.timeStamp` marks a
       store listener in the page set. The variant hooked the same listener. Eight rounds, A A B B A A B B, between two
       worlds.

       | Variant | Cover (median) | Uncover (median) |
       | --- | --- | --- |
       | Stock | 1.21 | 1.59 |
       | `will-change: opacity`, `'covering'` to `'clear'` | 0.41 | 0.77 |

       Idle reads 0.2–0.4.
     - **Stock.** The wash's own 1568 × 824 layer (about 0.9 of a screen) rastered in 22–30 of the cover's 24–31
       frames and 27–30 of the uncover's 28–31. With the hint it rastered once, for its paint.
     - **The fix.** The wash takes the hint with its paint, from clear, and lets it go at `'clear'`, so it holds
       through a re-cover. RED tests, mutants 5/5.
     - **Re-measure** on the product's own code, 4 rounds: the wash's layer rasters in at most one frame a fade.
     - **Not the wash, recorded and not chased:** the dissolve layer rastered every frame in some rounds (open since
       the document repaint investigation); the front sheet did too in one direction (kr1nd4ra to qb9mezm3); and the
       new world's sheets draw once.

- [x] **R27: the test gaps (tests only)** (`0765c0c7`)

  **Description:** Each case kills the named mutant, which lives today.
  - `src/animation/timelineMap.test.ts`:
    - A world timeline registered after `resumeWorldTimelines()` plays. Mutant: drop `worldPaused = false` at `:76`.
    - A timeline created paused and registered during the pause stays paused after the resume. Mutant: drop
      `&& !timeline.paused()` at `:50`.
    - A re-registered id that was paused by the world is not played on resume when the new timeline was created
      paused. Mutant: drop `pausedByWorld.delete(id)` at `:46`.
  - `src/systems/powerController.test.ts`: `resume()` is a no-op unless paused. Mutant: drop the guard at `:47`.
  - `src/systems/workLoop.test.ts`: a decision taken during the pause reads the frozen clock. Mutant: `pauseAtBase ??`
    dropped at `:765`.
  - `src/systems/worldChange.test.ts`: a change that writes the UI store while covered runs once and the state stays
    `'covered'` until it ends. Mutant: drop `&& prev.sceneWash !== 'covered'` at `:41`.
  - `src/animation/sceneWash.test.ts`: after the stop, a state change creates no timeline. Mutant: drop `unsubscribe()`
    at `:94`.
  - `src/engine/AudioEngine.test.ts`: a rejected `suspend` or `resume` is logged, not thrown. Mutant: drop the `.catch`
    at `:1525` or `:1538`.
  - `src/components/panels/screen/worldView/WorldView.test.tsx`: under `<StrictMode>`, a request still waits for the
    cover. This pins the attach and detach order.
  - `src/systems/spawnSystem.test.ts`: extend the Classic parity fixture (`:3479-3516`, three plain robots) with a
    robot that has a shaped stage, one with the bandpass accent, and one with an exclusive send. Capture the values at
    `cc9a01f2` with the parity dump. Mutant: swap the two shaped `lit` shares.
  - `src/data/bands/dealAspects.test.ts`:
    - A two-family, multi-pick deal.
    - A spread over about 30 seeds in which every rotation occurs.
    - Mutants: a shared deal dataId for every family; a two-value rotation.
  - `src/components/ui/physical/PowerRockerSwitch.test.tsx`: a second click during the sequence (after R18).
  - `src/animation/offScreenTheatre.test.ts` and `OffScreen.test.tsx`:
    - A superseded fade, and an unmount mid-fade. Mutant: drop `killTimeline(OFF_SCREEN_FADE_TIMELINE)` at
      `OffScreen.tsx:310`.
    - A first visit builds no payload. Mutant: drop `heardWorld &&` at `:192`.

  **Proof:** Mutation — every named mutant dies.

  **Acceptance criteria:**
  - [x] Each case fails on its mutant and passes on the code, but one: the `worldChange.ts` mutant is equivalent
        since R12 (As shipped, below), so its case passes on both. Deleting that check is Crawford's call.

  **Verification:**
  - [x] `npm test`; `npm run build:types`, `npm run lint` clean. At `0765c0c7`: `npm test` 13,162 of 13,162 in 344
        files; types clean; lint 0 errors (the 4 old warnings).

  **Dependencies:** Phase A (two cases pin R1's behaviour); R18 for the rocker case.

  **Files:** the test files above

  **Estimated scope:** M (about fifteen small cases)

  **As shipped (2026-10-31):** eighteen cases in the twelve files named, tests only.
  - **Mutants, before:** 15 of the 17 lived, as the plan said.
    - Two were already dying. Dropping `unsubscribe()` (now `sceneWash.ts:102`) failed 7 cases, because each case's
      leftover subscriber leaked into the next. Swapping the shaped `lit` shares failed the articulation-share case,
      which counts about 15 % shaped attacks over 400 robots.
    - The new cases kill both directly too.
  - **Mutants, after:** 16 of 17 die.
    - **The survivor is equivalent:** the `prev.sceneWash !== 'covered'` check in `worldChange.ts`. Since R12,
      `runPending` returns unless the state is `'covered'`. A store write while covered, with the check gone, queues
      one more `runPending`, and that run always finds `'uncovering'` or `'clear'`, so it returns. This holds before
      the hand-off and inside the change alike.
    - The case is kept anyway: "a change that writes the UI store while covered runs once, and the state stays
      `'covered'` until it ends". It pins the behaviour.
    - **Crawford's call:** the check is now only an economy: it saves a microtask that does nothing, once for each
      UI-store write a rebuild makes while covered. Delete it to make the gate clean, or keep it as the intent's
      statement. This task is tests only, so the code is unchanged.
  - **The cases:**
    - `timelineMap.test.ts`:
      - a world timeline registered after the resume plays;
      - one built paused and registered during the pause stays paused after it;
      - a re-registered id drops the replaced timeline's world pause.
    - `powerController.test.ts`: `resume()` on a cold world and on a running one wakes nothing.
    - `workLoop.test.ts`: a decision during the pause, at a wall clock long past the cooldown, still waits.
    - `worldChange.test.ts`: the case above.
    - `sceneWash.test.ts`: after the stop, `'covering'`, `'uncovering'` and `'clear'` make no timeline and no set.
    - `AudioEngine.test.ts`: a rejected suspend, and a rejected resume, each warn through `devWarn` and do not throw.
    - `WorldView.test.tsx`: under `<StrictMode>` the ref is the wash, and a change waits for the cover and runs once
      it lands. After the unmount a change runs at once.
    - `spawnSystem.test.ts`: the Classic parity tiers, below.
    - `dealAspects.test.ts`:
      - Melody (two picks) and Envelope (three) dealt together: every robot carries both; a company shares both; each
        family steps through its own list; the draws are at `aspects.melody.deal` and `aspects.envelope.deal`;
      - over 30 worlds a three-pick list starts on each of its picks.
    - `PowerRockerSwitch.test.tsx`: a second click during the sequence registers a second sequence and reaches
      `powerOnSequence` again.
    - `offScreenTheatre.test.ts`: a second fade kills the first before it completes and resolves when it completes.
    - `OffScreen.test.tsx`:
      - an unmount mid-fade kills the fade;
      - a first visit with a save loaded builds no payload. It sits in the gate describe, because the Keep describe
        marks the device heard.
  - **The parity tiers (a deviation from the plan's fixture).**
    - A shaped stage alone does not kill the swap. A shaped attack's roll is above 0.79, so it stays shaped under
      the swapped 0.725. The swap shows only on a robot whose roll sits between the two shares: 26 of 400 robots in
      the fixture's world, the first at index 28.
    - So a second parity case, keyed by index, holds robots 3, 4 and 28 of a 29-robot roster: a ripple attack with
      the bandpass accent; an exclusive shimmer send; and a plain lowpass-accent robot between the shares. The
      three-robot array is unchanged.
    - **Captured with the parity dump** in scratch worktrees at `cc9a01f2` and `0929d592`: byte-identical, and so is
      a 400-robot dump.
    - **Seen, not chased:** this world seeds no shaped release in 400 robots, where the band's comment says about
      15 % across worlds. That is a property of one world's coarse seeded draw.
  - **Proofs where the plan named no mutant:**
    - **WorldView:** a start-once guard that keeps the first mount's stop (`??=`, with the cleanup's reset dropped).
      It passes the plain-mount cases and dies under StrictMode.
    - **The superseded fade:** the shared GSAP stub completes every timeline by itself, so the case holds its
      timelines through a `gsap.timeline` spy. As a sanity mutant, `setTimeline` not killing a replaced timeline
      dies here; `timelineMap.test.ts` already kills it.
    - **The rocker:** the controller is mocked, so the case pins that the rocker takes the second click. R18's
      start-once guard is the controller's (`powerController.world.test.ts`). The mutant is R18's second fix option,
      the rocker ignoring clicks while `isTransitioning`; it dies. Choosing that option later flips this case.
  - **Line numbers since the plan:** `OffScreen.tsx`'s first-visit guard is at `:238` and its unmount kill at `:424`;
    `AudioEngine.ts`'s catches are at `:1533` and `:1548`; `sceneWash.ts`'s unsubscribe is at `:102`.

### Checkpoint D: Consider
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean. At `0765c0c7`: types clean; lint 0
      errors (the 4 old warnings); `npm test` 13,162 of 13,162 across 344 files (71 more than Checkpoint C, all from
      Phase D); `npm run build` clean (the usual chunk-size warning).
- [x] R26's five results recorded.
- [x] Reviewed with human before Phase E. (After the fact: Crawford answered on 2026-11-01, with Phase E built. His
      answers, and the tasks they became, are in [OFF_SCREEN_FINAL_FIXES.md](OFF_SCREEN_FINAL_FIXES.md):
      - **R26 item 2's Look** passed: "turning on looks good". He asked that a power-off fade the screen in rather than
        replay the boot flicker (F6).
      - **R26 item 3's Look** is not yet answered; it carries to that plan's Checkpoint: Complete.
      - **R26 item 4:** raise the footer to about 0.55 (F4); the descriptions stay.
      - **R18:** the second press joins the start under way (F1).
      - **R26 item 1's guard gap:** recorded, not fixed (backlog 43).
      - **R27's check:** removed (F2).
      - **The Keep failure line:** "storage is already full, cannot save world" (F3), plus a save-limit warning
        (backlog 44).
      - **New:** a theme change re-derives in place, with no wash (F7–F9).)
  - **For the review:**
    - the Looks of R26 items 2 and 3 (the fade's blur; the held description and warning lines);
    - R26 item 4's contrast figures (any change is his);
    - three findings: R18's double start (two fixes, with different UX); R26 item 1's guard gap (timelines built
      paused and played after registration); R27's equivalent `worldChange.ts` check (delete or keep);
    - the stand-in copy for the Keep failure line (R20).
  - Hard-reload any open dev page first (Ctrl+Shift+R): Phase D touched `src/systems`, `src/engine` and
    `src/animation`.

---

### Phase E: Nits

- [x] **R28: stale comments**

  **Description:** Comment-only.
  - `themes.ts:42` still calls the numbers placeholders "until the listen (Task 35)"; the listen kept them.
  - `OffScreen.tsx:46`: "nothing pops"; the aspect rows pop.
  - Family lists that leave out Voice: `OffScreen.tsx:169`, `types/Robot.ts:308-309`, `worldLink.ts:26-28`,
    `seedBaseline.ts:49-50`.
  - `spawnSystem.ts:145`: "the deal's one family in v1".
  - `spawnSystem.ts:359-362`: an orphaned docblock that also claims a visual role the robot body no longer has.
  - `describeWorld.ts:13`: "until Task 33".
  - `home.ts:21-22`: `AWAITING_CONSUMER`.
  - `workLoop.ts:40`: "the power-off paths'".
  - `sessionShareUtils.ts:107-108`.
  - The `killAll` comments that say "a power cycle", which R1 makes "a replaced paused world":
    `worldTransition.ts:101-104`, `AudioEngine.ts:1441`, `:1467`, `:1476`, `spawnSystem.ts:1326-1336`.
  - The CSS tombstone at `PowerRockerSwitch.css:184`.

  **Proof:** Read.

  **Acceptance criteria:**
  - [x] Every comment states what the code does now.

  **Verification:**
  - [x] Manual review; `npm run build:types`, `npm run lint` clean. At `1ee0c840`: types clean; lint 0 errors (the 4
        old warnings).

  **Dependencies:** R1.

  **Files:** the files above (comments only)

  **Estimated scope:** S

  **As shipped (2026-11-01, `1ee0c840`):** comment-only, 14 files.
  - **Moved since the plan:** "the deal's one family in v1" is in `robotFieldDerivation.ts` (R13's move). The
    orphaned docblock now sits on `generateAudioAttributes` again; it states what the function draws and that the
    body's geometry comes from the gem seed, not audio. `sessionShareUtils.ts:107-108` is the Share docblock's
    `melody=…`, now a param per family.
  - **Beyond the list:**
    - `Robot.loadedUnder`'s docblock named only `applyAspectDeal` as its writer. It now names the baseline deal and
      R33's `redealAspects` too.
    - `reRegisterAllRobotsAudio`'s docblock said "after a power-on". It now says a cold power-on, the page's first or
      one after a replaced paused world, and never a resume.
    - `AudioEngine.reserveVoice`'s site list said "the power cycle". It now says a cold power-on.
  - **The CSS tombstone was deleted**, not reworded: it described a modal that no longer exists.
  - **Left alone:** `lfoEngine.ts:61` and `:229` ("re-priming across a power cycle is Task 10's wiring"),
    `main.tsx:48`, `timelineMap.ts:30` and `sessionShareUtils.ts:36`. They use "power cycle" for off-then-on, and none
    is a `killAll` comment. The `instrumentsLoaded` comment's `stop()` goes with R31.

- [x] **R29: `OffScreen.tsx`, `WorldView.tsx` — `useGSAP` returns its cleanup**

  **Description:** "useGSAP ignores its callback's return" (`OffScreen.tsx:304`, `WorldView.tsx:37`) is wrong for this
  stack. `useGSAP` adds the callback to a `gsap.context`, whose `add` keeps a returned function and runs it on revert
  (`gsap/dist/gsap.js:3658`, GSAP 3.14.2). Return the cleanup from each `useGSAP` callback and drop the extra
  `useEffect` and its ref.

  **Proof:** Refactor. Existing tests pass unmodified, plus R27's StrictMode case.

  **Acceptance criteria:**
  - [x] One hook per component for the timelines and their cleanup.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/components/panels/screen/worldView`:
        432 of 432 in 17 files before and after, tests unmodified.

  **Dependencies:** R27.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/worldView/WorldView.tsx`

  **Estimated scope:** XS

  **As shipped (2026-11-01, `731999dd`):** as planned.
  - **The claim was checked first:** `@gsap/react` 2.1.2 calls `context.current.add(callback, scope)`, and
    `Context.add` in gsap 3.14.2 pushes a function result onto `_r`, which `kill({})` (that is, `revert()`) runs.
  - **In tests:** the global `gsap` mock has no `context`. `@gsap/react` is not inlined, so it runs on the real gsap,
    and the returned cleanup runs on unmount there too.
  - **Mutants:** five, each dropping one line of a returned cleanup. All five die:
    - the wash's stop: the two "after unmount it runs at once" cases, plain and StrictMode;
    - the wash ref: "drops it on unmount";
    - the boot stop and the off-screen ref: "kills the theatre and drops the ref on unmount";
    - the fade kill: "an unmount mid-fade kills the fade with the screen".
  - **Timing:** the kills now run in the layout effect's cleanup, a little earlier than the passive `useEffect`'s.
    Nothing reads the gap.
  - **Not touched:** `PowerRockerSwitch`, which the old comment named as the pattern's source. It is outside the
    task's files.

- [x] **R30: small hardening and simplification**

  **Description:**
  - `describeWorld.ts:37` tests `theme in THEME_NAME_KEY`, which is true for `'constructor'`; use `isThemeId`.
  - `describeWorld.ts:34` throws on a save with no `coordinates` (a hand-edited save, through `OffScreen.tsx:272-276`).
    Have the pick skip a payload `loadingOf` cannot describe, or have `describeWorld` fall back.
  - `sessionShareUtils.ts:94` calls `encodeURIComponent` outside its `try`. A name holding a lone surrogate throws
    `URIError` out of `retransmitWorld`; move it inside. *(After R17 the call is gone: the mirror writes through
    `URLSearchParams`, which turns a lone surrogate into U+FFFD rather than throwing. The RED case below should pass
    from the start; keep it as the guard, or drop the item.)*
  - `loadingIdentity.ts`'s `typeof pick === 'string'` filter is redundant after `canonicalAspects`.
  - `OffScreen.tsx:361`'s `picks as AspectId[]` becomes an `isAspectOf` filter. *(Done in R15 another way: the cast is
    gone, since `canonicalPicks` takes any strings and filters by the family itself.)*
  - `RosterBoard.tsx:142` deletes from `timelineMap` directly, leaving its scope behind; use a registry call.
  - `vitest.setup.ts:138-139`'s module-level `to` / `fromTo` stubs gain `paused()`.
  - The stale `shutdown` mocks go: `SleeveContainer.test.tsx:8`, `PowerRockerSwitch.light.test.tsx:19`.
  - `powerController.ts:95` repeats `startLocaleSystems`' `setWorldState('running')`.

  **Proof:**
  - **RED test**, `src/utils/describeWorld.test.ts`: `'constructor'` reads as Classic, and a payload with no
    coordinates is not a crash.
  - **RED test**, `sessionShareUtils.test.ts`: a lone-surrogate name does not throw.
  - The rest are refactors: existing tests pass unmodified.

  **Acceptance criteria:**
  - [x] No behaviour change beyond the three named. One more, small and found here: a finished roster glide's scope
        now leaves the registry with it (R30.3).

  **Verification:**
  - [x] `npm test`; `npm run build:types`, `npm run lint` clean. At `73312979`: `npm test` 13,177 of 13,177 in 345
        files; types clean; lint 0 errors (the 4 old warnings).

  **Dependencies:** None.

  **Files:** the files above, `src/utils/describeWorld.test.ts`, `src/utils/sessionShareUtils.test.ts`

  **Estimated scope:** S

  **As shipped (2026-11-01):** four commits, R26's precedent for a multi-item task.
  - **R30.1 `e66fda8f`, describeWorld (RED):**
    - The tail asks `isThemeId`. Five prototype keys (`constructor`, `toString`, `hasOwnProperty`, `__proto__`,
      `valueOf`) failed first: `labels` read `.lore` off a prototype function.
    - **The fallback chosen:** describeWorld names a world with no readable plot by its seed alone, bare and labelled,
      tail kept. A plot is readable when it is an object with numeric `x` and `y` (`plotOf`), so absent, `null`, `{}`,
      half plots and string values are no plot. That name is honest: applying such a save keeps the loaded plot, since
      `retransmitWorld`'s `attenuationStyleOnly` mode moves nothing else.
    - **Beyond the plan's file list:** an `OffScreen.test.tsx` case picks a save with no coordinates. It checks the
      readout and the selected row, on the review's own path.
    - Three mutants (the object guard, the number check, the old `in` test) all die.
  - **R30.2 `65225db5`, the lone surrogate (guard):**
    - It passed from the start, as predicted, and is kept as the guard. Four names, with a lone high and a lone low
      surrogate at the start, middle and end.
    - An `encodeURIComponent` of the name put back outside the `try` fails it, and fails no other case.
  - **R30.3 `5277381a`, RosterBoard (RED):**
    - The finish now calls `killTimeline` behind the same identity check, and the finish reads through `getTimeline`.
      The board no longer imports `timelineMap`.
    - The new scope case failed first ("expected 'ui' to be undefined").
    - A second new case pins the identity check, which had no test: a replaced glide of the same robot that finishes
      late leaves the newer one registered.
    - Two mutants, both killed.
  - **R30.4 `73312979`, the refactors:**
    - **loadingOf:** a new `loadingIdentity.test.ts` pinned non-string picks before the filter went. There was no
      direct test of `loadingOf`. A mutant that coerces picks to strings dies.
    - **The gsap stub:** `tweenStub` keeps its paused state, as the timeline stub does.
    - **Two stale `shutdown` mocks** went.
    - **The duplicate `'running'`:** removing it failed 9 cases in `powerController.test.ts`, because its
      `startLocaleSystems` mock did not write the state the real one writes. The mock now writes it; no assertion
      changed. The real chain still reads `'running'`.
  - **Not done here:** the `OffScreen.tsx:361` cast item, which R15 already handled.

- [x] **R31: remove what nothing needs** (Crawford, 2026-10-31: yes to all of it, Open Question 7)

  **Description:** Approved: "i'll follow your recs here. if we don't need something, let's get rid of it." None of
  these changes behaviour; the gain is one name per value and no test-only API on the controller.
  1. **Five lookup maps in `loadingNames.ts` lose `export`.** `THEME_DESCRIPTION_KEY` (`:24`), `ASPECT_NAME_KEY`
     (`:35`), `ASPECT_FAMILY_LABEL_KEY` (`:59`) and `ASPECT_DESCRIPTION_KEY` (`:70`) map ids to content keys.
     - Only the module's own helpers read them (`themeDescription`, `aspectName`, `familyLabels`,
       `aspectDescription`), and nothing imports them.
     - The maps stay; only the keyword goes.
     - `THEME_NAME_KEY` loses `export` too, once R30 swaps `describeWorld.ts`'s read of it for `isThemeId`.
  2. **Two test-only methods leave `powerController`.**
     - `noteWorldReplaced()` (`powerController.ts:61-63`) sets `'cold'` and nothing else. It was written for a caller
       that tears a world down outside `initializeLocale`, which never appeared; only `powerController.test.ts:118`
       calls it. After R1 it is a trap: a world it marks cold keeps its paused systems running underneath. That test
       moves to the real path: pause, a held rebuild, power on.
     - `getWorldState()` (`:65-67`) passes straight through to `worldState.ts`'s `getWorldState`. The app imports the
       module function; only `powerController.test.ts` calls the method (eight sites). Those tests import the module
       function instead.
  3. **Three pre-band-table names go: `GLOBAL_AUDIO_LOADING_RANGES` and `COLOUR_LOAD_MIX_MAX`
     (`globalAudioLoadingRanges.ts:41`, `:30`), and `BPM_SEED_RANGE` (`bpmSeed.ts:21`).**
     - Before the band table they were the seed ranges the generators read. Since Tasks 21–22 the generators read
       `getBand(...)`.
     - `GLOBAL_AUDIO_LOADING_RANGES` is now a projection of `CLASSIC`, kept "so the grid mirror still has a file", and
       `BPM_SEED_RANGE` is `CLASSIC.bpm`. Only tests read them (`globalAudioLoadingRanges.test.ts`, `bpmSeed.test.ts`,
       `globalAudioSeed.test.ts`), plus docs.
     - Removing them points those tests at `CLASSIC` and keeps every guard they hold:
       - the key set, less the Returns;
       - each band inside its field's full range;
       - whole numbers on integer fields;
       - lit colour wets above zero;
       - the 0.25 colour Mix ceiling. That one is Crawford's own rule from Global Colour T14 ("don't allow any of the
         new color mixes to exceed .25 on load"). It stays, as a test on `CLASSIC`'s colour bands, never dropped.
  4. **`ROBOT_SEND_LOADING_RANGES` and its `SendLoadingRange` type go** (`robotSendLoadingRanges.ts:19-28`).
     - It is the same kind of projection of `CLASSIC`, and only tests read it: `sends.test.ts`,
       `globalAudioLoadingRanges.test.ts`, `robotSendLoadingRanges.test.ts`, `spawnSystem.test.ts` and
       `globalAudioSeed.test.ts`.
     - `EXCLUSIVE_SEND_FIELDS`, `ExclusiveSendField` and `SEND_FIELD_ROOM` stay in the file, because spawn and
       `classic.ts` read them.
     - `spawnSystem.test.ts:911-919` edits the projection to reach `CLASSIC`'s band. It switches to `withLoading` with
       a test table.
  5. **`src/data/globalAudioLoadingRanges.ts` goes whole.** With item 3 done it holds nothing anything reads:
     `LoadingRange` has no other user, and `LOADING_RANGE_KEYS` is private. Its test's guards move to a test of
     `CLASSIC`, as item 3 lists them.
  6. **`AudioEngine.stop()` goes** (`AudioEngine.ts:739-758`). Nothing calls it but one case,
     `AudioEngine.test.ts:5698-5705`, which stops and restarts the engine to check velocities replay. That case calls
     `killAll()` instead, the restart path R1 makes real. `stop()` was dead on `main` too; it is small, so it rides here.
  7. **The branch's other unneeded exports go:**
     - the four family key arrays in `aspects.ts` (`MELODY_BAND_KEYS`, `ENVELOPE_BAND_KEYS`, `DISTANCE_BAND_KEYS`,
       `VOICE_BAND_KEYS`) and `THEME_BAND_KEYS` in `themes.ts` lose `export`, since only their own modules read them;
     - `powerController.ts`'s `export type { WorldState }` re-export goes, since nothing imports it.

     Type exports that name an exported function's parameters or result stay. Exports that predate the branch are out
     of scope.
  - **In the same commit,** the source comments that name the removed tables point to `classic.ts`:
    `audioRigConfig.ts:449`, `classic.ts:18-20` and `:78`, `globalAudioSeedRanges.ts:4`, `globalAudioSeed.ts:499`. The
    docs that name them follow in R32.

  **Proof:** Read. The suite passes with the tests moved to the real path and to `CLASSIC`, and every guard listed in
  item 3 is still asserted.

  **Acceptance criteria:**
  - [x] Every item above is gone, and `npx ts-prune -p tsconfig.app.json` lists none of them.
  - [x] The 0.25 colour Mix ceiling and the other moved guards are still asserted.

  **Verification:**
  - [x] `npm test`; `npm run build:types`, `npm run lint` clean. At `64484605`: `npm test` 13,174 of 13,174 in 345
        files (3 fewer than R30: the two projection cases and the `BPM_SEED_RANGE` tautology went, and the
        `noteWorldReplaced` case moved to the real chain); types clean; lint 0 errors (the 4 old warnings).

  **Dependencies:** R1 (item 2 makes the trap moot), R30 (`THEME_NAME_KEY`).

  **As shipped (2026-11-01):** five commits.
  - **R31.1 `6f82ea0e`, items 1 and 7 (part):** the five `loadingNames.ts` maps and the four aspect key arrays lose
    `export`.
    - **Found:** `resolveBands.test.ts` read all five key arrays, through `vi.importActual`, which `ts-prune` does not
      count. That is why the review saw no reader.
    - The aspect arrays have a second exported name, `ASPECT_FAMILIES.<family>.keys`, which the test now reads.
  - **R31.2 `d4f158fc`, item 2 and the `WorldState` re-export:**
    - The eight `getWorldState()` test sites read the module function.
    - The `noteWorldReplaced` case moved to `powerController.world.test.ts` as a new case on the real path (pause, a
      held rebuild, power on): the cold path resumes neither the context, the world timelines nor the loop clock.
    - Three mutants, each putting one resume back on the cold path, all die.
  - **R31.3 `73ee8473`, items 3 to 5:**
    - `globalAudioLoadingRanges.test.ts` moved (`git mv`) to `src/data/bands/classic.test.ts`. Its guards read
      `CLASSIC`, and the 0.25 ceiling is a test constant carrying Crawford's rule.
    - The send guards stay in `robotSendLoadingRanges.test.ts`, read off `CLASSIC`'s send rows.
    - The two projection cases went, with nothing left to project, and so did the `BPM_SEED_RANGE` tautology.
    - The quiet-threshold case wrote into the projection, which was `CLASSIC`'s own row object. It now overrides the
      Delay row through a `getBand` spy rather than a test table, since `withLoading` takes an identity, not a table.
    - A Chebyshev Mix band raised to 0.3 fails the ceiling case.
    - **Comments:** the source comments point to `classic.ts`, including five sites beyond the plan's list:
      `bandKeys.ts`, `globalAudioSeedRanges.ts:87`, `robotSends.ts`, `spawnSystem.ts`'s `generateRobotSends` and
      `Robot.gritSend`. `resolveBands.test.ts`'s mentions stay: they record the constants as they stood at `cc9a01f2`.
  - **R31.4 `fd09e595`, item 6:** `AudioEngine.stop()` goes; the velocity-replay case calls `killAll()`.
  - **R31.5 `64484605`, item 7 (rest):**
    - R31.1 first kept `THEME_BAND_KEYS` exported, because the test read it and it has no other name.
    - It then went too. The test now types the v1 key list in, as its `EXPECTED` Classic table already is, so widening
      the list is a change there too.
    - The array then had no runtime reader, so `ThemeBandKey` is a plain union. A Calm column naming `robot.decay`
      still fails to compile (TS2353).
  - **`ts-prune` after:** none of the named items. It still lists `ThemeBandKey`, `DistanceBandKey` and
    `AspectFamily` as used only in their own module. Each types an exported value (`THEMES`, `ASPECT_FAMILIES`), the
    kind the plan keeps. `powerController`'s default export predates the branch.


  **Files:** `src/utils/loadingNames.ts`, `src/systems/powerController.ts`, `src/data/globalAudioLoadingRanges.ts` (deleted), `src/data/robotSendLoadingRanges.ts`, `src/utils/bpmSeed.ts`, `src/engine/AudioEngine.ts`, `src/data/bands/aspects.ts`, `src/data/bands/themes.ts`, the comment sites above, and the tests that move

  **Estimated scope:** S

- [x] **R32: the doc nits**

  **Description:**
  - `docs/SESSION_STORAGE.md`:
    - `:63`: the Transmission row is `list`, not muted.
    - `:75`: `generateWorldSeedBaseline` takes a `WorldSeedIdentity`.
    - `:76` and `:108`: payload `version` 3.
    - `:186`: a payload's loading change is `coordsOnly` with a loading, not `loadingOnly`.
    - `:100`: four families, not "Melody".
  - `docs/UI_SHELL.md`:
    - `:81`: the DOM order is veil, dark layer, column.
    - `:84`: the saves are re-read after Keep; the save's name fronts Current.
  - `docs/COMPONENT_LIBRARY.md:92`: the `trailing` prop.
  - `docs/CONTENT_LAYER.md:61`: `SectorPreset.name` and `sector.preset.*` are gone.
  - `docs/todo/backlog.md:69-72`: the anchor to item 5, now archived, and "5's interview".
  - `docs/todo/roadmap.md` 57's summary: 79 keys and four kinds, not "78" and "three"; all four family params; the list
    with Roll on Current; the aspect rows pop.
  - `docs/todo/archive/backlog-archive.md:32` and `docs/ideas/themes.md:62` still describe "as theme".
  - `docs/AUDIO_SYSTEM.md`:
    - `:147`: Foundry's Retransmit and a Load are powered-on chrome, not changes while paused.
    - `:147`: `expectSound` is the diagnostics sample's own flag.
    - `:166`: 28 declarations went, not 22.
  - `docs/COMPANIES.md:27`: four families.
  - `docs/reference/ROBOT_DATA_GRID.md:92`: the intro names one family and two tables.
  - `docs/PROCEDURAL_GENERATION.md` registers `aspects.<family>.deal` and `robot.send.reverb.quiet`.
  - **After R33** (an aspect change re-deals in place, with no wash):
    - `docs/ANIMATION_SYSTEM.md:512`: the wash's caller list drops "a theme or family change" to "a theme change".
    - `docs/UI_SHELL.md:84` and `:86`: the pick rules and the scene-wash callers.
    - `docs/AUDIO_SYSTEM.md:171`: the derive functions run at spawn, in the deal and in the live re-deal.
    - `docs/AUDIO_SYSTEM.md:170`: `retransmitWorld({ aspects })` is the `aspectsOnly` mode, not `loadingOnly`; only a
      theme change rebuilds (found at R11).
    - `docs/COMPANIES.md:31`: a family row re-deals the live roster.
  - **After R20:** Keep reads "Save Last World" in `docs/specs/OFF_SCREEN.md:197`, `docs/UI_SHELL.md:83` and roadmap
    57's summary (`docs/todo/roadmap.md:583`).
  - **After R15** (added at R22): the record types are `FamilyPicks` and `FamilyAspects` (`aspects.ts`), not
    `Partial<Record<AspectFamilyId, AspectId…>>`:
    - `docs/specs/OFF_SCREEN.md` assumptions 9, 10 and 21 (`:179`, `:187`, `:318`) and the §2 interfaces (`:504`,
      `:508`, `:511`, `:514`, `:518`, `:760`), as one dated amendment;
    - `docs/SESSION_STORAGE.md:186`;
    - `docs/COMPANIES.md:33`.
  - **After R31:** the docs that name the removed tables point to `classic.ts`, and `AudioEngine.stop()` leaves the
    cleanup line:
    - `docs/AUDIO_SYSTEM.md:166`, `:169`, `:305`, `:322`, `:329`, `:543`, and `:131` (the `stop()` sentence);
    - `docs/reference/GLOBAL_CHAIN_GRID.md:11`, `:74`, `:76`, `:78`, `:118`, `:128`, `:129` (its code mirror is now
      `classic.ts`);
    - `docs/reference/ROBOT_DATA_GRID.md:15`, `:17`;
    - `docs/reference/SLIDER_VALUES.md:7`, `:142`, `:178`;
    - `docs/reference/TONE_EFFECTS_INVENTORY.md:3`, `:39`, `:114`;
    - `docs/SESSION_STORAGE.md:153`.
  - **`CLAUDE.md`: approved by Crawford (2026-10-31).** The edits:
    - `:68`, the Session Storage line, still says "the 6-slot autosave"; the autosave went before this branch
      (`docs/tasks/SESSION_AUTOSAVE_REMOVAL.md`).
    - The same line calls the shareable link "the separate, not-yet-built Phase 21"; it shipped.
    - The reference-doc one-liners for `AUDIO_SYSTEM.md`, `UI_SHELL.md`, `ANIMATION_SYSTEM.md`, `ROBOT_LIFECYCLE.md`,
      `COMPANIES.md` and `SESSION_STORAGE.md` don't mention the sections this branch added: power as a pause, the band
      table, the off screen, the deal and the scene wash.
    - These are edits to the description lines, not changes to any rule.
  - In `docs/tasks/OFF_SCREEN.md`, tick Checkpoint 0's review box (`:154`) with the date Crawford passed the
    checkpoints.

  Spot-check every claim against the code after Phases A–D.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] Each listed passage matches the code (checked one by one at the tree after R31; Crawford's Read is the proof).

  **Verification:**
  - [x] Manual review; `npm run build:types`, `npm run lint` clean. At `92c67ba2`: types clean; lint 0 errors.

  **Dependencies:** Phases A–D and R31.

  **Files:** the docs above

  **Estimated scope:** S (docs only)

  **As shipped (2026-11-01, `92c67ba2`):** 20 docs, content-only churn.
  - **Line numbers moved or meant something else:**
    - The spec's Keep label is at `:239`, not `:197`.
    - `docs/todo/archive/backlog-archive.md:32` never says "as theme"; it named only "the Melody aspects", now the
      four families.
    - `docs/COMPANIES.md:27` is the theme-or-Melody sentence.
  - **Beyond the list:**
    - `SESSION_STORAGE.md:21` carried the same stale `Partial<Record…>` type as `:186`.
    - `SESSION_STORAGE.md:186`: a payload's loading change is `coordsOnly` with a loading because `applySessionPayload`
      always sends the plot. The line now says why, and names `loadingOnly` and `aspectsOnly` as the off screen's rows.
    - `GLOBAL_CHAIN_GRID.md`'s LFO Drift line pointed at `globalAudioLoadingRanges.ts`, which never held the drift. It
      now names `LFO_BANK_DRIFT_SEED_RANGE` (`globalAudioSeed.ts`).
    - `BEAT_CLOCK.md:57` contrasted `killAll()` with the deleted `stop()`.
    - `UI_SHELL.md`'s address-bar line gains "or family change". Its pick rules gain R3's "every click joins a waiting
      change", and Keep gains its dim-while-waiting and its failure line.
  - **Roadmap 57's About** describes the branch as it stands, and its framing sentence says so. Decisions and Not
    Doing stay the first build's record. "79 keys, four kinds" was checked against `CLASSIC` itself (`vite-node`).
  - **The themes idea doc** (`docs/ideas/themes.md`): its two "as theme" lines sit in a dated Decided list, so each
    gets a dated reversal note rather than a rewrite. Its pre-build survey of the removed table names stays as written,
    R10's precedent.
  - **`CLAUDE.md`:** six reference one-liners edited (approved). No rule or reference entry was added.
  - **Left alone:** `resolveBands.test.ts`'s comments on the constants "as they stood on main at `cc9a01f2`", and
    `AUDIO_SYSTEM.md`'s `MELODY_BAND_KEYS` (the constant still exists, now private).

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean. `npm test` 13,174 of 13,174 in
      345 files at `64484605` (R31's tip; R32 changed docs only). Types, lint (0 errors, the 4 old warnings) and
      `npm run build` (the usual chunk-size warning) at `92c67ba2`.
- [ ] The five probes rerun and recorded:
  1. nothing paused after a pick;
  2. the bank equals the store;
  3. the clock restarts;
  4. both toggles land;
  5. no keyboard loop.
- [ ] The parity dump is still identical to `main`'s (Phase D moved the deal code).
- [x] Every Look and Crawford decision flagged here if not done in the session, never silently skipped. (Flagged in
      the walkthrough on 2026-11-01. He answered all of it except R26 item 3's Look.)
- [ ] Ready for Crawford's PR.

**Moved on 2026-11-01:** the two open boxes above (the five probes and the parity dump), with a sixth probe for the
in-place theme change, are F10 of [OFF_SCREEN_FINAL_FIXES.md](OFF_SCREEN_FINAL_FIXES.md). The PR waits on that plan's
Checkpoint: Complete.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| R1's `killAll` on a replaced paused world, then a full `start()`, re-runs `loadInstruments` and the reverb wait on the next power-on | Medium | `main` ran exactly that on every power cycle. Probe 3 and Checkpoint A's listen cover it, and the real-chain test pins the order. |
| R2 writes into a suspended context | Low | Tone schedules param writes at the frozen `currentTime`; probe 2 checks the outcome. An unprimed bank is untouched, as now. |
| R33's in-place re-deal drifts from what a rebuild would deal, or leaves an undealt family on its old aspect | High | R33's tests compare the re-dealt fields with a rebuild under the same loading, family for family, and check that an emptied family equals an undealt spawn. The diff of an untweaked world stays `{}`. |
| R3 rewrites the off screen's state model | Medium | Smaller after R33, which takes the aspect rows out of the wash. Covered by the review experiments, the reduced-motion cases unmodified, and the Checkpoint B Look. |
| R8's `display: contents` drops the group role in a browser | Medium | Check the accessibility tree first; the measured-offset fallback is named in the decision. |
| R12's promise hand-off reorders a test's expectations | Low | Tests await a flush; the wash timings are re-measured. |
| R13's move breaks parity | Medium | A pure move with no logic edits, the parity dump before and after, and the fixture from R27. |

## Open Questions

Asked in the first version of this plan and answered by Crawford the same day, 2026-10-31.

1. **A world replaced while off: decoration moving or frozen behind the veil?** **Resolved:** moving behind the veil,
   as a fresh page's cold world does (probe 1). R1 ends the pause span in its teardown.
2. **The selection at the click (R3).** **Resolved:** "whatever's more performant". The two cost the same, one render
   per click, so the rows draw from the intent, which the Current-cancel case needs (Architecture Decisions).
   Crawford added: "should we only refresh the world when necessary, btw, probably not on every aspect change". **Yes:
   R33.** An aspect change re-deals the live roster in place, with no rebuild and no wash. A theme change still
   rebuilds, because it moves the global half and every robot's theme bands.
3. **Melody accents (R5).** **Resolved:** fix them here.
4. **The hour across a theme change (R22).** **Resolved:** keep it.
5. **Announcing the chooser.** **Resolved:** focus goes to the selected row when the chooser appears after a power-off
   (R25).
6. **Keep's failure line (R20).** Crawford answered "Save Last World". **Taken as Keep's new label** (it was "Save the
   last session"); the failure line keeps a stand-in in the label's voice until his words. **If "Save Last World" was
   meant for the failure line instead, say so before R20.**
7. **The removals in R31 and the `CLAUDE.md` lines in R32.** Crawford asked what they are; R31 and R32 spell each one
   out. **Resolved:** "i'll follow your recs here. if we don't need something, let's get rid of it." All of them go
   ahead. R31 also takes the other unused code the review found: the second send projection, the old range file
   whole, `AudioEngine.stop()`, the branch's unneeded exports, and R1's now-pointless `AudioEngine.resume()` in the
   cold path.
8. **Which of Phase D to build.** **Resolved:** all of it.
