# Play until in the Station: review findings

A five-axis review (correctness, readability, architecture, security, performance; the code-review-and-quality
workflow) of backlog 84 as merged in PR #644 (`6480c952`), against
[docs/tasks/PLAY_UNTIL_IN_THE_STATION.md](../tasks/PLAY_UNTIL_IN_THE_STATION.md) and the spec's "As built". Read on
2026-11-14 on `fixes/components`. Nothing was changed; this file is the whole output. Like `component-findings.md`, it
is a review-output list: an item that gets picked up takes the next number from the shared todo counter.

Method: the merge's source diff read whole (36 files, +3,510 / −170; 13 source files, the rest tests and docs), the new
module and its test read whole, every caller of `isDockMuted` / `isRobotAudible` / `isRobotEmitting` and of the new
engine API found by grep. Verification re-run on the clean tree: the twelve touched test files (1,226 tests, 0 failed),
`npm run build:types` clean, `npm run lint` clean apart from the four old `react-refresh` warnings. Three mutants
applied and restored, each killed by a named test: the voice-rebuild start clamp (`Math.max(Tone.now(), fade.start)`
→ `Tone.now()`; "before the ramp starts … ramping from the start"), the reversed arc's `killTimeline` in
`turnBackAtPort` (three turn-back tests), and the cancel's explicit now (`time ?? Tone.now()` → `time`; three cancel
tests). One probe test written for a path the suite does not cover; it failed, which is finding R1. The probe was
deleted; the app was not run.

**Outcome (2026-11-14, `fix/station-fade-review`):** Crawford asked for R1, N1–N3 and F1. All five are built, each on
its own commit (R1: 44181fbe, bac27a6b; F1: 2e036934; N1: bd8c1ffd; N2: 6b30441d, 6f15f689; N3: 5ab6ef02), with the
docs in the commit after. C1–C3 and F2–F4 stand as written: not asked for.

Verdict: **approve, with one required follow-up (R1).** The change improves the codebase: the dock's silence moved to
one predicate with one required parameter, the fade is one record with one factor and one write path, the loop never
reaches the engine, and the plan's deviations are each recorded with a RED case. R1 is a latent bug on a path the
battery cannot reach today, so it is a fix, not a revert.

## Summary

| Severity | Count | Themes |
| --- | --- | --- |
| Required | 1 | The fade system's `started` record goes stale across a re-entry no tick sees |
| Consider | 3 | `AudioEngine.ts` growth; tests that pin the gate's constant; the stale record's root in the plan |
| Nit | 3 | A function named like a predicate; `activity`'s position differs between two helpers; the native-context read |
| FYI | 4 | Swell-write ramp churn; the exit's ramp-up depends on call order; security; performance |

---

## Required

### R1. A robot that re-enters within one sixteenth is never started again, and holds at its port for ever

`src/systems/stationFadeSystem.ts:63` forgets a started robot only when a tick sees it not `'entering'`. The work
loop's own test, "recalled again during the reverse" (`src/systems/workLoop.test.ts:1092`), shows a re-entry that no
tick can see: the reversed arc ends, the robot is not Active, `resume` → `returnToStation` writes `'returning'`, and
"still on the port, so the swim home is zero-length" `enter` writes `'entering'` again in the same call. The record
still says `'fade'`, so `onTick` skips the robot (`was !== undefined`, line 55) on every later tick. The robot stands at
its port, visible, Docked and `'entering'`, with its slot held and its fade cancelled at the Active landing, so it
plays at full volume until its next Active landing. Probe (a copy of the suite's own helpers): start on step 1, then
`activity('r1','returning'); activity('r1','entering')` with no tick between, then ticks 2..16 and 1 again, expecting a
second `scheduleStationFade`. Got 1 call.

Reachability today: the recall must land during the reverse, under a measure after an Active landing, and a robot that
has just recharged is nowhere near critical, so the lifecycle does not produce it. The loop supports the path by test;
the fade system does not deliver the entry it promises. A debug battery write reaches it.

Fix: the system does not need its own memory. Two records already tell the truth for an `'entering'` robot: the
engine's `stationFades` (set by `scheduleStationFade`, deleted by `cancelStationFade` at every Active landing and by
`killAll`) and the loop's `arcRunning` (set by `enterOnBar`, gone at `'charging'` or at the reverse's end). So:
`started = AudioEngine.hasStationFade(id) || arcRunning(id)` (one new one-line read on the engine; `arcRunning`
exported from `workLoop.ts`), the Solo cancel becomes `soloed && hasStationFade(id)` (the delete makes it once), and
the `started` Map, its `Started` type and the forget loop go. Checked against every case in the suite: the hold, Solo at
entry, Solo mid-fade, a turn-back in the hold and mid-arc, a robot with no voice (recorded only), teardown. The minimum
alternative is one more condition, "a started robot whose arc is not running is forgotten", which keeps the Map. Either
way the probe above is the RED test, in `stationFadeSystem.test.ts`.

---

## Consider

### C1. `AudioEngine.ts` is 1,909 lines (+123) and its test 8,294 (+500)

The fade's record, `stationFadeFactor`, `continueStationFade` and the fade branch of `writeBusGain`
(`src/engine/AudioEngine.ts:215-273`) are a self-contained unit with one Map of state, the shape of the siblings in
`src/engine/audioEngine/` (`standingBy.ts`, `headroom.ts`). Moving them to `audioEngine/stationFade.ts` leaves the
three public methods as thin calls and takes the Map out of the engine's module scope. The new `describe` block in
`AudioEngine.test.ts` (lines 63-520 of the added section) runs under one worker; as its own file it would run beside
the rest, which is the split the test-pruning work preferred. Neither is required: the engine has been this size for a
long time and the merge did not make a structural choice worse.

### C2. The boundary tests pin the constant the gate is meant to move

`src/systems/stationFadeSystem.test.ts:102-105` asserts `STATION_FADE_MIN_STEPS` is 8, and lines 107-130 hard-code
steps 9 (fades) and 10, 12, 16 (hold). The constant's comment says "the gate's to move"; moving it to 6 or 10 fails
tests that are about the rule, not the number. Derive the first holding step from the constant
(`SIXTEENTHS - STATION_FADE_MIN_STEPS + 2`) and drop the value pin, so the rule's tests survive the gate's number.

### C3. The plan's Architecture Decision behind R1

"The system, not the engine, remembers which robots it has started" (the task doc's Architecture Decisions, and the
header of `stationFadeSystem.ts`) is the design root of R1: a second scheduling record beside the two that already
exist. If R1 takes the recommended fix, that decision and the module header should say the opposite, and the "Phase 3
as built" bullet on `started` being a `Map` goes.

---

## Nit

### N1. `inside(loop, robotId)` reads as a predicate

`src/systems/workLoop.ts:695` is the entry arc's end (the `'charging'` write, or the exit if Active). A verb or a
noun phrase (`arrivedInside`, `landInStation`) reads at the call site in `enterOnBar` (line 875).

### N2. `activity` is the fourth argument of `isRobotAudible` and the fifth of `isRobotEmitting`

`src/utils/robotAudibility.ts:35-58`. The comment on line 49 explains it (it comes after the required `isSounding`),
and the compiler enforces every site, so nothing is wrong; it is one more thing to remember at six call sites. An
options object, or `activity` before `isSounding` in `isRobotEmitting` (two call sites), removes the note.

### N3. `secondsUntilHeard` reads the native clock through its own cast

`src/engine/AudioEngine.ts:1777` casts `rawContext` to read `currentTime`; `readContextSeconds` in
`src/engine/nativeContext.ts:33` is the canonical native-context reader but rejects 0, which is a legitimate clock
value at start, so the bespoke read is defensible. A one-clause comment saying why the helper is not used would stop the
next reader from unifying them.

---

## FYI

- **F1. Swell writes re-issue the fade every sixteenth.** `writeBusGain` (`AudioEngine.ts:261-273`) re-issues
  `rampOver(gain, 0, end − writeTime, writeTime)` on every timed Volume write that lands mid-fade, so a Volume swell on
  a fading robot adds a ramp point per tick. Each continues the same line (Tone's `linearRampTo` starts from the value
  at `writeTime`), so it is automation churn, not a change of sound.
- **F2. The exit's half-second ramp-up depends on call order.** In `landOnActive` (`src/systems/robotSystems.ts:287`)
  the store write comes first, and the budget's synchronous subscriber readmits the robot and rebuilds its voice at
  `busGainTarget`, which is 0 under the completed fade; only then does `cancelStationFade` ramp it to its target over
  `STATION_FADE_RECOVER_SECONDS`. That is Task 9's stated behaviour ("a robot exiting its station … with the ramp back
  over the constant"), but it holds because the readmit runs before the cancel. Were the budget's admission ever
  deferred, the exit would come up at full with no ramp and no test would notice.
- **F3. Security.** No new trust boundary: the inputs are store state and the audio clock. `secondsUntilHeard` rejects a
  non-finite clock and `readContextSeconds` already guards the latency reads. Nothing to add.
- **F4. Performance.** One more `'16n'` roster scan beside the swells' (a Set and a spread per tick); `Tone.now()`
  enters `busGainTarget` only for a robot with a recorded fade, and only while it has a voice (the Volume path returns
  without one, `AudioEngine.ts:1424`; the Highlight path iterates voices). The as-built's headless probe measured the
  ramp itself. Nothing to measure further.

## Verification story, checked

The task doc's claims held on re-run: the touched suites green, types and lint clean, the three claimed mutants killed.
The three "existing tests pass unmodified" boxes left open (Tasks 3, 4, 13) are honest: each change is deliberate and
in its commit. The docs' names were spot-checked while reading (`cancelStationFade(robotId, time?)`, `arcRunning`,
`resumeWorldTimelines` → `resume()`, `started` as a `Map`): all as shipped.
