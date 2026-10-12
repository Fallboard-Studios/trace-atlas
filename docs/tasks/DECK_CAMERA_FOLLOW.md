# Implementation Plan: Deck Camera — Continuous Follow

Spec: [docs/specs/DECK_CAMERA_FOLLOW.md](../specs/DECK_CAMERA_FOLLOW.md). Intent:
[docs/intent/deck-camera-follow.md](../intent/deck-camera-follow.md). No sketch. Continues
`feature/deck-camera` (HEAD `74abaf24`, plus this session's uncommitted scroll-snap removal —
unrelated prior work on the same branch, not part of this plan). Roadmap Phase 46.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`,
`npm run build`, `npm run dev`, `npm run perf:idle` (after `npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

The spec's three Open Questions (Q1 wheel-as-instant-release, Q2 tie-break reference point, Q3
docs-test scope) are built as written, with its recommendation; each names the one task a
different answer would change.

## Overview

Thirteen tasks in six phases. Phase 1 tears out what's being replaced — both old triggers
(tap-to-pan, the lifecycle cut) — before any new code lands, so nothing is ever calling two
competing camera models at once. Phase 2 rebuilds `deckCamera.ts` itself in three vertical slices:
the touch/release input model (testable alone, no ticker needed), the pure pick algorithm
(testable alone, no ticker needed), then the ticker that wires both of those plus the follow/dock/
cooldown clock into one running loop — by the end of Phase 2 the camera drives itself with no
overrides yet. Phase 3 adds the two edit-return overrides as independent slices (robot, then
company), each reusing Phase 2's `pick()`/float machinery rather than inventing new motion code.
Phase 4 is Crawford's dev-server look. Phase 5 is the two gates. Phase 6 is docs. Every task
leaves types, lint and the suite green; RED first; one commit per task; every behavioral test is
mutation-checked (the exact boundary it guards broken on purpose, watched to fail).

## Architecture Decisions

- **Old triggers come out before new code goes in** (Phase 1). `panDeckCameraTo`/`cutDeckCameraTo`
  and their only callers (`RobotScreen.tsx`'s `PanToRobotButton`, `workLoop.ts`'s `'active'`
  branch, `deckCameraTarget.ts`) are deleted first; `deckCamera.ts`'s own old exports are deleted
  in Phase 2 once nothing references them.
- **Touch/release and the pick algorithm are built and tested independently of the ticker**
  (spec §1.2–1.4): neither needs a running follow loop to verify, so each gets its own task and
  its own RED-first tests before Task 7 wires them together. This is the spec's own
  `findRobot`/`undockedRobotIds`/`pick` split, not a new decomposition.
- **One `gsap.ticker` handler, added in `registerDeckScroller` and removed on `null`**, does all
  per-frame work (continuous tracking, follow-duration/dock checks, cooldown-expiry pick) —
  spec assumption 6. No `requestAnimationFrame`, no `setInterval` (CLAUDE.md).
- **`cameraScrolling` and the `scroll` listener do not survive the rewrite** (spec assumption 7):
  once touch/release are the only "user did something" signals, a programmatic `scrollLeft` write
  can never be mistaken for one.
- **The edit-return overrides keep their own mirror of "last selected"** (spec assumption 11),
  updated from a `useUIStore.subscribe` callback, because `goHome()` clears the live
  `selectedRobotId`/`selectedCompanyId` fields *before* `activeHubTile` goes to `null` — the edge
  this plan triggers on.
- **The company override calls the exact same `pick()` the cooldown-expiry path calls**, just with
  a pre-filtered id list (spec assumption 13) — no second selection algorithm.

## Dependency Graph

```
T1 record intent+spec+plan
T2 remove tap-to-pan (RobotScreen/css/content) ──┐
T3 remove lifecycle-cut (workLoop, deckCameraTarget deleted) ─┤
                                                               ▼
                                            T4 constants rewritten
                                                               │
                                                               ▼
                                            T5 touch/release input model
                                                               │
                                                               ▼
                                            T6 undockedRobotIds() + pick()
                                                               │
                                                               ▼
                                            T7 the ticker: follow/dock/cooldown/boot
                                                               │
                                                               ▼
                                        Checkpoint A (automatic loop, no overrides)
                                                               │
                                       ┌───────────────────────┴───────────────────────┐
                                       ▼                                               ▼
                             T8 robot edit-return override                 T9 company edit-return override
                                       └───────────────────────┬───────────────────────┘
                                                               ▼
                                            Checkpoint B (Crawford's dev look)
                                                               │
                                                               ▼
                                            T10 idle-paint perf gate
                                                               │
                                                               ▼
                                            T11 Pixel underrun A/B + manual walk
                                                               │
                                                               ▼
                                            T12 ANIMATION_SYSTEM + docs test
                                                               │
                                                               ▼
                                            T13 roadmap 46, intent/spec headers
```

## Task List

### Phase 1: Clear the ground (old triggers out)

## Task 1: Record the intent, spec and plan

**Description:** Commit `docs/intent/deck-camera-follow.md`, `docs/specs/DECK_CAMERA_FOLLOW.md`
and this plan as they stand, so every later diff is code. The already-uncommitted scroll-snap
removal from earlier in this branch's work is a separate, unrelated change and is not part of this
commit.

**Acceptance criteria:**
- [ ] `git status` after the commit shows no change to any of the three docs files; no source file
      is touched.

**Verification:**
- [ ] `git log -1 --stat` lists exactly the three docs files (plus whatever else the branch already
      had staged from the prior session, if not committed separately first).

**Dependencies:** None.

**Files:** `docs/intent/deck-camera-follow.md`, `docs/specs/DECK_CAMERA_FOLLOW.md`,
`docs/tasks/DECK_CAMERA_FOLLOW.md`

**Estimated scope:** XS (docs commit)

## Task 2: Remove tap-to-pan

**Description:** Delete `PanToRobotButton` from `RobotScreen.tsx`; both call sites
(`RobotAvatarColumn`, `RobotAvatarBand`) render the bare `AvatarGem` they already have, no button
wrapper. Delete `.robot-screen__pan` and its `:focus-visible` rule from `RobotScreen.css`. Delete
the `probe.band.panToRobot` entry from `src/content/copy/probe.ts`. `panDeckCameraTo` itself stays
in `deckCamera.ts` for now (Task 5 deletes it, once it truly has zero callers including tests) —
this task only removes the UI that called it (spec §1.5, assumption 9).

**Acceptance criteria:**
- [ ] Neither `RobotAvatarColumn` nor `RobotAvatarBand` renders a `<button>` around the gem; both
      render `AvatarGem` directly.
- [ ] `RobotScreen.test.tsx`'s pan-tap tests are deleted; a new case confirms the gem in both
      contexts has no button role and no click handler reaches `panDeckCameraTo` (mock the module
      and assert it is never called).
- [ ] `src/content/content.test.ts` and ESLint pass with the entry gone (nothing still references
      `probe.band.panToRobot`).
- [ ] Dev server: opening a robot's screen on the phone band and the desk column shows the gem
      with no focus ring and no response to a click.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx src/content` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: the dev-server check above.

**Dependencies:** Task 1.

**Files:** `src/components/panels/screen/screens/RobotScreen.tsx`,
`src/components/panels/screen/screens/RobotScreen.css`,
`src/components/panels/screen/screens/RobotScreen.test.tsx`, `src/content/copy/probe.ts`

**Estimated scope:** S

## Task 3: Remove the lifecycle-cut coupling

**Description:** Delete `onLifecycleChange`'s `'active'`-branch call into the camera
(`workLoop.ts:777-780`, including the `workingRobotIds` lookup that only existed to feed it).
Delete `src/systems/deckCameraTarget.ts` and `deckCameraTarget.test.ts` outright — no other caller
exists once this branch is gone (spec §1.5, assumption 10). `cutDeckCameraTo` and
`DECK_CAMERA_STATION_CHANCE` stay for now (Tasks 4–5 delete them, once nothing — including tests —
references either).

**Acceptance criteria:**
- [ ] `onLifecycleChange(…, 'active')` no longer imports or calls anything from
      `@/animation/deckCamera` or `@/systems/deckCameraTarget`.
- [ ] `workLoop.test.ts`'s `cutDeckCameraTo`-calling cases (the `'active'` cases and the
      station/working-robot-choice cases) are deleted, not replaced — nothing in `workLoop.ts`
      calls the camera anymore, so there is nothing left to assert.
- [ ] `deckCameraTarget.ts`/`.test.ts` no longer exist; `rg deckCameraTarget src` finds nothing.

**Verification:**
- [ ] `npx vitest run src/systems/workLoop.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean (no dangling import of the deleted module).

**Dependencies:** Task 1.

**Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`,
`src/systems/deckCameraTarget.ts` (deleted), `src/systems/deckCameraTarget.test.ts` (deleted)

**Estimated scope:** S

### Phase 2: Rebuild the module

## Task 4: Constants rewritten

**Description:** In `src/constants/deckCamera.ts`: add `DECK_CAMERA_FOLLOW_MS = 20000` and
`DECK_CAMERA_COOLDOWN_MS = 8000` (each with a comment citing spec §1.6) and
`DECK_CAMERA_MIN_BATTERY_PCT = 50`; delete `DECK_CAMERA_IDLE_MS`, `DECK_CAMERA_CUT_COOLDOWN_MS` and
`DECK_CAMERA_STATION_CHANCE` (the last of these now has zero importers after Task 3).
`DECK_CAMERA_PAN_S` and `DECK_CAMERA_TIMELINE_ID` are unchanged. No importer of the new constants
yet.

**Acceptance criteria:**
- [ ] The three new exports exist with those values and types (`number`, `number`, `number`).
- [ ] The three deleted exports no longer exist; nothing in `src` still imports them (a stale
      import would fail type-check).

**Verification:**
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Tasks 2, 3.

**Files:** `src/constants/deckCamera.ts`

**Estimated scope:** XS

## Task 5: `deckCamera.ts` — the touch/release input model

**Description:** Replace the shipped idle-gate machinery with the held/release model (spec §1.4,
assumption 8): module state `held: boolean`; `pointerdown`/`touchstart` set `held = true` and call
`killTimeline(DECK_CAMERA_TIMELINE_ID)`; `pointerup`/`touchend` set `held = false` and
`cooldownStartedAt = performance.now()` (the variable itself is introduced here, consumed starting
Task 7); a `wheel` event does the kill and the release in the same handler, immediately (no
separate "held" window for it). The `scroll` listener and `cameraScrolling` are deleted — nothing
replaces them (assumption 7). Delete `panDeckCameraTo`, `cutDeckCameraTo`, `noteDeckUserInput`,
`isDeckCameraIdle`, `__setDeckCameraScrolling` and their tests; `registerDeckScroller` keeps its
role as the listener attach/detach point but now attaches `pointerdown`/`touchstart`/`wheel`/
`pointerup`/`touchend` (five listeners, no `scroll`).

**Acceptance criteria:**
- [ ] `pointerdown` and `touchstart` each set `held` true and kill the registered `deck-camera`
      timeline if one is running (assert on the fake timeline's `kill`).
- [ ] `pointerup` and `touchend` each set `held` false and stamp `cooldownStartedAt` to the current
      (mocked) `performance.now()`.
- [ ] A `wheel` event kills any running timeline and stamps `cooldownStartedAt`, with `held` false
      immediately after (never left `true`).
- [ ] `registerDeckScroller(null)` detaches all five listeners (the fake scroller records
      add/remove pairs) and still kills the timeline, as before.
- [ ] `panDeckCameraTo`, `cutDeckCameraTo`, `noteDeckUserInput`, `isDeckCameraIdle`,
      `__setDeckCameraScrolling` no longer exist as exports.

**Verification:**
- [ ] `npx vitest run src/animation/deckCamera.test.ts` passes; mutation check: swap the `wheel`
      handler to only kill (never stamp cooldown) and the wheel case fails.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 4.

**Files:** `src/animation/deckCamera.ts`, `src/animation/deckCamera.test.ts`

**Estimated scope:** M

## Task 6: `deckCamera.ts` — `undockedRobotIds()` and `pick()`

**Description:** Two new internal functions (spec §1.3, assumptions 1, 2, 3, 15, and the
2026-10-11 empty-pool amendment). `undockedRobotIds()`: reads the active locale the way
`OceanScene.tsx` does (`selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())
?.currentLocaleId`, then `useLocaleStore.getState().getLocaleById(localeId)?.robots ?? []`,
`workLoop.ts`'s own `robotsOf` pattern), filtered to `docking === DockingState.Active ||
docking === DockingState.Recalled`. `pick(candidateIds)`: among those with `batteryLevel > 
DECK_CAMERA_MIN_BATTERY_PCT`, the lowest `batteryLevel` wins; if none qualify, the lowest
`batteryLevel` across the whole input list wins; a tie breaks by whichever candidate's `targetFor`
value is closest to the scroller's current viewport centre (`scrollLeft + clientWidth / 2`). An
empty input list is a no-op that also sets `cooldownStartedAt = performance.now()` — the next
attempt is a full `DECK_CAMERA_COOLDOWN_MS` later, not retried immediately. `pick()` does not yet
start a float or set a subject — it only returns/records the winner's id; Task 7 wires the winner
into motion.

**Acceptance criteria:**
- [ ] `undockedRobotIds()` excludes `Docked` and `Undocking` robots and includes `Active` and
      `Recalled` ones (seed all four states in one locale fixture).
- [ ] `pick()` prefers the lowest `batteryLevel` among `> 50`; with none `> 50`, falls back to the
      lowest overall; a tie (two candidates at the same battery, different positions) resolves to
      the one closer to the current viewport centre.
- [ ] `pick([])` is a no-op that stamps `cooldownStartedAt` to the current (mocked)
      `performance.now()`.
- [ ] Every fixture robot's battery/docking/position is a distinct, non-default value (the
      parity-fixture rule) — two candidates seeded identically would prove nothing about the
      tie-break.

**Verification:**
- [ ] `npx vitest run src/animation/deckCamera.test.ts` passes; mutation check: change `> 50` to
      `>= 50` and a battery-exactly-50 fixture's expected outcome flips, catching the boundary.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 5.

**Files:** `src/animation/deckCamera.ts`, `src/animation/deckCamera.test.ts`

**Estimated scope:** M

## Task 7: `deckCamera.ts` — the ticker

**Description:** One `gsap.ticker.add` handler (spec §1.2, assumption 6), added in
`registerDeckScroller` when a scroller is first set, removed (`gsap.ticker.remove`) on `null`.
Module state added: `subjectId`, `followStartedAt`, `cooldownStartedAt = -Infinity` (the boot
sentinel). Each tick, in order: if `held`, do nothing; else if `subjectId` is set, check the
subject's `docking` — `Docked` calls `endFollow()` (kills the timeline if one is still registered,
clears `subjectId`, stamps `cooldownStartedAt`); still `Active`/`Recalled` past
`DECK_CAMERA_FOLLOW_MS` since `followStartedAt` also calls `endFollow()`; otherwise writes
`scroller.scrollLeft = targetFor(subjectId)` (clamped, reusing the existing helper); else (no
subject) if `performance.now() - cooldownStartedAt >= DECK_CAMERA_COOLDOWN_MS`, calls
`pick(undockedRobotIds())`. `createCameraTween`'s `onComplete`/`onInterrupt` are rewired: instead
of only clearing a scrolling flag, a successful float's `onComplete` sets `subjectId` to the
robot just floated to and `followStartedAt = performance.now()`, starting the followed phase. This
task is the one point where `pick()`'s return value actually starts a float+follow — Task 6 only
computed the winner.

**Acceptance criteria:**
- [ ] At boot (fresh module state, `cooldownStartedAt = -Infinity`), the first tick picks and
      floats immediately — no initial wait.
- [ ] A subject still `Active`/`Recalled` after exactly `DECK_CAMERA_FOLLOW_MS` ends the follow on
      that tick; one millisecond short does not.
- [ ] A subject whose `docking` becomes `Docked` ends the follow on the very next tick, regardless
      of how long it had been followed; a `Recalled` subject is never ended this way.
- [ ] While following, each tick writes `scrollLeft` from the subject's live `x` (move the fake
      ref's `x` between ticks and see `scrollLeft` move with it).
- [ ] After a follow ends, `DECK_CAMERA_COOLDOWN_MS` must elapse before the next `pick()` call; one
      millisecond short does nothing.
- [ ] `registerDeckScroller(null)` removes the ticker handler (no further ticks act even if the
      module's fake ticker is invoked again after).

**Verification:**
- [ ] `npx vitest run src/animation/deckCamera.test.ts` passes; mutation checks: change the follow
      duration comparison from `>=` to `>` and the boundary test fails; skip `endFollow()` on
      `Docked` and the dock-ends-early test fails.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 6.

**Files:** `src/animation/deckCamera.ts`, `src/animation/deckCamera.test.ts`

**Estimated scope:** M

### Checkpoint A: The automatic loop (no overrides yet)

- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] Dev server, any viewport: left alone, the camera picks a robot, holds it up to 20 s or until
      it docks, rests 8 s, picks again — indefinitely, with no manual interaction.
- [ ] Touching the scroller mid-follow freezes the camera exactly where it is; releasing starts an
      8 s wait before the next pick.
- [ ] If every robot happens to be docked at once (force it from the console), the camera does
      nothing and tries again roughly every 8 s, not continuously.
- [ ] **Stop and report** any surprise in the live feel (pacing, how often it re-picks the same
      robot) before Phase 3's overrides build on this loop.

### Phase 3: The overrides

## Task 8: Robot edit-return override

**Description:** Spec §1.4, assumptions 11, 12, 14. Module state: `lastSelectedKind: 'robot' |
'company' | null`, `lastSelectedRobotId: string | null`. A `useUIStore.subscribe` callback
(registered in `registerDeckScroller`, unsubscribed on `null`) updates `lastSelectedRobotId`/
`lastSelectedKind = 'robot'` on every state change where `selectedRobotId` is non-null. On the
edge where `activeHubTile` goes from non-null to `null`: if `lastSelectedKind === 'robot'` and
that robot's current `docking` is `Active` or `Recalled`, call a shared `forceFollow(id)` helper
(kills anything running, builds the float tween, same `onComplete` as `pick()`'s, bypassing the
cooldown check entirely) with `lastSelectedRobotId`; otherwise do nothing (whatever the loop was
already doing continues untouched).

**Acceptance criteria:**
- [ ] Selecting a robot, then `activeHubTile` going non-null then back to `null`, forces a float to
      that robot when it's `Active`/`Recalled` — no 8 s wait, interrupting any running follow or
      cooldown.
- [ ] The same sequence with that robot `Docked` or `Undocking` does nothing — the loop's existing
      state (another follow, a cooldown countdown) is left exactly as it was.
- [ ] Selecting robot A, then robot B, then returning to the Deck acts on B only.
- [ ] Selecting a robot without `activeHubTile` ever returning to `null` (browsing within the hub)
      triggers nothing.

**Verification:**
- [ ] `npx vitest run src/animation/deckCamera.test.ts` passes; mutation check: drop the
      `Docked`/`Undocking` eligibility check and the "does nothing when docked" case fails.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: open an undocked robot's screen, wait, back out — the camera jumps to it.

**Dependencies:** Checkpoint A.

**Files:** `src/animation/deckCamera.ts`, `src/animation/deckCamera.test.ts`

**Estimated scope:** M

## Task 9: Company edit-return override

**Description:** Spec §1.4, assumption 13, symmetric to Task 8. Module state:
`lastSelectedCompanyId: string | null`, same `lastSelectedKind` slot (`'company'`). Same
subscribe/edge shape, keyed on `selectedCompanyId`. On the trigger edge, if
`lastSelectedKind === 'company'`: build that company's robot ids (`useLocaleStore`'s robots
filtered by `companyId === lastSelectedCompanyId`), intersect with `undockedRobotIds()`'s filter;
if that intersection is non-empty, call `pick()` on it; if empty, call `pick(undockedRobotIds())`
(the full fallback). Whatever `pick()` returns is handed to `forceFollow` (Task 8's helper),
bypassing the cooldown check the same way the robot override does.

**Acceptance criteria:**
- [ ] Selecting a company with at least one undocked member, then returning to the Deck, forces a
      float to the lowest-battery eligible member of *that company only* — never a non-member, even
      if a non-member has lower battery.
- [ ] Selecting a company whose every member is docked/undocking, then returning, forces a float to
      some other undocked robot in the locale (the fallback), not a no-op.
- [ ] The tie-break and the `> 50`-else-everyone rule both apply within whichever pool was used,
      identical to Task 6's `pick()` behavior — no second algorithm.
- [ ] Selecting company A, then company B, then returning acts on B's pool only.

**Verification:**
- [ ] `npx vitest run src/animation/deckCamera.test.ts` passes; mutation check: break the
      intersection (use the company's full roster instead of its undocked subset) and the
      "never a non-member... even if docked member would otherwise be excluded" case fails to
      distinguish — assert the picked id is always a company member when any qualify.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Checkpoint A, Task 8 (shares `forceFollow`).

**Files:** `src/animation/deckCamera.ts`, `src/animation/deckCamera.test.ts`

**Estimated scope:** S

### Checkpoint B: Crawford's dev look

- [x] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [x] The spec §5.3 walk in the dev server: left alone (settle/drift/repeat, low-battery
      preference), touch mid-follow (freeze, 8 s wait on release), a followed robot docking
      (release, no chase), robot edit-return (undocked → jump; docked → no-op), company
      edit-return (member pool; fallback when the company is all-docked), reduced motion (instant
      floats).
- [x] **Stop and report.** Crawford answers spec §7 Q1–Q3 against the live thing; any change is the
      one task/assumption named beside each question.

### Phase 4: Gates

## Task 10: Idle-paint perf gate (full feature)

**Description:** `npm run perf:idle`, this branch against `main`, same pinned `?session=` link,
three rounds each, plus one round left running long enough to capture the ticker's steady-state
cost while the camera is actively following (not idle) — this phase's camera never truly stops the
way the shipped idle-cut model did, so its resting cost is the number that matters, not a single
forced transition.

**Acceptance criteria:**
- [ ] Pass: median idle busy and Paint within each build's round-to-round spread, no worse than the
      shipped phase's Checkpoint A/Task 11 numbers (docs/PERFORMANCE.md). **MISSED**: busy +23 %
      (1265 → 1551 ms); Paint held; accepted by Crawford 2026-10-11, not explained.
- [x] The continuous-tracking round is recorded, not gated (same convention as the shipped phase's
      forced-cut round).
- [x] Recorded in PERFORMANCE.md under "Deck Camera Follow — the Task 10 perf gate (Phase 46)".

**Verification:**
- [x] **Stop and report** the numbers before any change.

**Dependencies:** Checkpoint B.

**Files:** `docs/PERFORMANCE.md`

**Estimated scope:** S (measurement)

## Task 11: Pixel underrun A/B and Crawford's manual walk

**Description:** Spec §5.2 gate 2 and §5.3: on the Pixel in portrait, `?debug` overlay, the same
`?session=` link, three two-minute listens each on `main` (GitHub Pages) and the branch, each left
untouched long enough to see at least one full follow→cooldown→pick cycle. Then the same §5.3 walk
as Checkpoint B, on the phone.

**Acceptance criteria:**
- [ ] Underruns on the branch within the run-to-run spread already recorded for 17.2.6. **Not
      measured**: no A/B counts were captured; Crawford reports the Pixel running great (2026-10-11).
- [x] Crawford signs off the walk, or names the change (the follow/cooldown durations and the
      battery threshold are the likely ones; each is one constant from Task 4). Signed off verbally,
      no change named.

**Verification:**
- [x] Manual (Crawford). **Stop and report.**

**Dependencies:** Task 10.

**Files:** `docs/PERFORMANCE.md` (the underrun row); constants only if re-tuned.

**Estimated scope:** XS

### Phase 5: Docs

## Task 12: ANIMATION_SYSTEM.md and the docs test

**Description:** Rewrite `ANIMATION_SYSTEM.md`'s "Deck camera" section (written for the shipped
idle/cut model — spec open Q3 notes this gap predates this phase and is being closed here, not
left for later) to describe the follow/cooldown/pick loop, the `gsap.ticker` handler, and the two
edit-return overrides, and state the rule that nothing else may call into the module.
`src/docs/deckCameraFollowDocs.test.ts` (the `layoutReworkDocs.test.ts` pattern) checks that the
doc and this spec name only files and exports that exist: `deckCamera.ts`'s current exports, the
five constants, the `uiStore` fields read.

**Acceptance criteria:**
- [ ] The docs test passes and fails when one named export is renamed in the doc (mutation check).
- [ ] CLAUDE.md's reference-doc line for ANIMATION_SYSTEM.md mentions the follow loop, not the old
      idle-cut description.

**Verification:**
- [ ] `npx vitest run src/docs` passes.

**Dependencies:** Task 11.

**Files:** `docs/ANIMATION_SYSTEM.md`, `src/docs/deckCameraFollowDocs.test.ts`, `CLAUDE.md`

**Estimated scope:** S

## Task 13: Roadmap 46, intent and spec headers

**Description:** Roadmap 46: record this phase's decisions (the empty-pool cooldown restart, the
wheel-as-instant-release call, the viewport-centre tie-break) as "Decisions made after the spec",
and the two gate results in one line each. Intent and spec headers gain a "Built … on
`feature/deck-camera`" line, matching the layout-rework intent's style.

**Acceptance criteria:**
- [ ] Roadmap 46 reads as a record of the follow model, not the superseded idle-cut one.

**Verification:**
- [ ] `npx vitest run src/docs` passes (roadmap links resolve).

**Dependencies:** Task 12.

**Files:** `docs/todo/roadmap.md`, `docs/intent/deck-camera-follow.md`,
`docs/specs/DECK_CAMERA_FOLLOW.md`

**Estimated scope:** XS

### Checkpoint: Complete

- [ ] All spec §5.1 tests exist and pass; both §5.2 gates recorded; §5.3 walk signed off.
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` clean.
- [ ] A `code-review-and-quality` pass over the branch, then the PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| A per-frame `scrollLeft` write (continuous tracking) costs more than the old one-shot tweens did, at idle-paint-gate scale | High | Task 10 measures a steady-state following round explicitly, not just idle; `will-change`/compositor promotion is already on the moving layers from earlier phases, nothing new to add there |
| The `activeHubTile` non-null→null edge is missed if `selectedRobotId`/`selectedCompanyId` happen to already be null by the time `useUIStore.subscribe` fires (ordering within one `set()` batch) | Med | `goHome()`'s `cleanSlate()` → `setActiveHubTile(null)` ordering was read directly from `navActions.ts` (spec assumption 11) and the mirror variables are updated independently of the edge check, so the edge handler never reads the live (already-cleared) fields — only its own mirror |
| `wheel`'s instant touch+release (spec Q1) makes the camera re-pick too eagerly during a long two-finger-trackpad scroll on desktop | Low | Flagged as inference, not interview-confirmed, in spec Q1; Checkpoint B's manual walk is the first real chance to feel it wrong |
| An edit-return override firing while a `pick()`-driven float is already in flight double-builds a timeline | Med | `forceFollow`/`pick` both go through `setTimeline`, which kills whatever `deck-camera` id already holds before building the new one — same mechanism the shipped module already relied on for two pans in a row |
| Company override's fallback (assumption 13) accidentally reuses the company-scoped pool instead of truly falling back to all undocked robots | Med | Task 9's mutation check asserts the picked id is a company member only when the company has eligible candidates, and is not restricted to it when the company has none |

## Open Questions

Spec §7 Q1–Q3, answered by Crawford at Checkpoint B against the live build. Until then the plan
builds the spec's recommendations, and each answer is the one task named beside it there.
