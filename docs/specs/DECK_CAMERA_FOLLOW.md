# Phase Spec: Deck Camera — Continuous Follow

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (Vitest; `npx vitest run <path>` for one file)
> - Idle-paint gate: `npm run build && npx vite preview --port 4173`, then
>   `npm run perf:idle --throttle 1 --only none --port 9301 --url <pinned ?session= link>`
>   (docs/PERFORMANCE.md, "The localizer")
> - Phone underrun A/B: the `?debug` overlay's playback-underrun count on the Pixel, same
>   `?session=` link, this branch against `main` (docs/AUDIO_SYSTEM.md, "?debug")
> - Dev server: `npm run dev`

**Built 2026-10-11 on `feature/deck-camera`**; decisions made after this spec and the two gate results
are recorded under [roadmap 46](../todo/roadmap.md#46-mobile-deck-camera-the-world-crop-on-phones).

Roadmap Phase 46. Intent: [docs/intent/deck-camera-follow.md](../intent/deck-camera-follow.md)
(confirmed 2026-10-11; where this spec and the intent differ, the intent wins). No sketch: the
visible result is a camera that is always doing something, not a new static layout. Branch
`feature/deck-camera` (continues the branch the shipped fit/scroller/scroll-snap-removal work is
already on; this phase does not touch any of that).

This phase replaces `src/animation/deckCamera.ts`'s entire trigger model. Today: tap a robot's
gem to pan to it (never gated); the work loop cuts to a robot going `'active'`, but only while
the scroller has seen no input for 8 s, and never again within 20 s of the last cut. After this
phase: the camera always has a subject. It follows one robot continuously for up to 20 s or until
that robot docks, then rests 8 s, then picks the next subject itself (lowest battery, preferring
robots above 50 %), floats to it, and repeats — forever, interrupted only by the user's own touch
or by backing out of a robot's or company's screen back to the Deck.

Every file, function and constant named below was checked against the working tree on 2026-10-11
(branch `feature/deck-camera`, HEAD `74abaf24`, plus this session's already-applied scroll-snap
removal, uncommitted).

## Assumptions (correct these before the plan)

1. **"Undocked" excludes `Undocking`, not just `Docked`.** `workLoop.ts`'s own
   `isDockedOrUndocking(robot) = docking === Docked || docking === Undocking` hides a robot at its
   station in *both* states (`onRobotMounted`, `adopt`) — an `Undocking` robot has not actually
   left yet, so it is not "swimming around" either. The candidate pool and both edit-return
   overrides use `docking === DockingState.Active || docking === DockingState.Recalled`, not a
   bare `!== Docked` check.
2. **"Lowest battery" reads `Robot.batteryLevel` (0–100) directly**, no normalization; "more than
   50 % energy" is `batteryLevel > 50`.
3. **Tie-break ("whichever is closest to the camera") compares each candidate's own pixel target**
   (`targetFor`'s scale, the same one the float uses) **against the scroller's current viewport
   centre** (`scrollLeft + clientWidth / 2`), smallest absolute difference wins. Picked at the
   moment of selection, not re-evaluated.
4. **The 20 s follow clock starts when the float-in tween completes, not when the robot is
   picked.** "Follows a robot for... 20 seconds" (intent) is the time spent actually on the robot;
   the float itself (`DECK_CAMERA_PAN_S` = 1.4 s) is not charged against it. A dock that happens
   mid-float still cancels the float and skips straight to cooldown (assumption 4 continued below).
5. **A dock mid-float also ends the pending follow before it starts.** The per-frame check
   (assumption 6) runs regardless of whether the camera is floating or already following; if the
   subject docks while the float tween is still running, the tween is killed and the cooldown
   starts immediately, same as a dock that happens mid-follow.
6. **Continuous tracking is a `gsap.ticker` handler, not a tween.** Precedent already in the
   codebase: `audioDiagnostics.ts`'s `gsap.ticker.add`/`.remove`, and the pattern
   `rooftopGreebles.tsx`'s own comment describes. One handler, added in `registerDeckScroller` when
   a scroller is first set and removed when it is cleared (`null`), does all of the module's
   per-frame work: while following, write `scroller.scrollLeft` from the subject's live `x` (reused
   from `targetFor`) every tick; while not held by the user, check whether the active clock (follow
   or cooldown) has elapsed and act. This replaces `cameraScrolling`/the `scroll` listener entirely
   (assumption 7) — GSAP is already "handling the work" for the float; the ticker handles the
   follow, no `requestAnimationFrame` of its own (CLAUDE.md).
7. **`cameraScrolling` and the `scroll` listener are deleted, not kept alongside the new state.**
   They existed only to tell the camera's own tween-driven scroll apart from the user's. A
   programmatic `scrollLeft` write never fires `pointerdown`, `touchstart` or `wheel`, so once
   those three are the only "the user touched it" signals (assumption 8), nothing can mistake the
   camera's own motion for a touch, and the distinction is no longer needed.
8. **"Touch" = `pointerdown`/`touchstart`; "release" = `pointerup`/`touchend`; `wheel` has no
   separate release**, so a `wheel` event is treated as an instantaneous touch-then-release: kill
   whatever the camera is doing, then immediately start the 8 s cooldown (there is no "held" state
   to wait out for a wheel tick). A real `pointerdown`/`touchstart` enters a held state — the camera
   stays dead, no clock runs — until the matching `pointerup`/`touchend`, which is what starts the
   cooldown. This is the one rule in this spec with no direct precedent in the interview (which
   only discussed touch); flag if wheel should behave differently.
9. **Tap-to-pan is deleted outright**, not deprecated or hidden. `panDeckCameraTo` is removed from
   `deckCamera.ts`; `PanToRobotButton` in `RobotScreen.tsx` is removed and both its call sites
   (`RobotAvatarColumn`, `RobotAvatarBand`) go back to rendering the bare `AvatarGem` they already
   have, with no button wrapper; `.robot-screen__pan` (`RobotScreen.css`) and the
   `probe.band.panToRobot` content entry (`src/content/copy/probe.ts`) are removed with it.
10. **The lifecycle-cut coupling is deleted outright.** `onLifecycleChange`'s `'active'` branch
    (`workLoop.ts:777-780`) no longer calls the camera at all — the camera decides for itself, on
    its own clock, who to follow next. `src/systems/deckCameraTarget.ts`
    (`chooseDeckCameraCutTarget`) and its test become dead code (no other caller) and are deleted,
    along with `DECK_CAMERA_STATION_CHANCE` (`constants/deckCamera.ts`). The "prefer a working robot
    over the station" idea this chooser implemented has no equivalent in the new model — the pick
    algorithm only ever looks at battery, never at what a robot is doing.
11. **The edit-return overrides need their own memory of "last selected," because the store clears
    the live field before the transition that triggers the override.** `goHome()`
    (`navActions.ts:201`) calls `cleanSlate()` — which calls `selectRobot(null)` and
    `selectAllRobots()` (clearing `selectedCompanyId`) — *before* `setActiveHubTile(null)`. By the
    time the camera module observes `activeHubTile` go to `null`, `selectedRobotId` and
    `selectedCompanyId` are already `null`. The module keeps its own two module-level variables
    (`lastSelectedRobotId`, `lastSelectedCompanyId`, plus which one is more recent), updated from a
    `useUIStore.subscribe` callback on every write where the new value is non-null, consulted only
    at the `activeHubTile: non-null → null` edge — never read reactively off the live store fields.
12. **"Edited at all" in the intent means "that entity's screen was open," full stop** — the
    subscribe callback does not try to detect an actual field edit, only the selection itself,
    matching the interview's confirmed "any time you had a robot's screen open and leave it."
13. **The company pick (override 2) is the same `pick()` the cooldown-expiry path uses, called with
    a pre-filtered candidate list** (that company's robot ids, via `Robot.companyId`, intersected
    with the undocked filter) and falling through to the unfiltered undocked list when that
    intersection is empty — one function, one tie-break rule, used by both the normal loop and both
    overrides.
14. **A docked (or undocking) "last selected" robot is not a special case needing its own branch** —
    `pick()` is already never asked to consider a docked robot a valid single-robot override
    either; the robot override simply checks eligibility first and calls the ordinary cooldown-less
    "float now" path only when it passes, otherwise doing nothing (the loop's own state, whatever
    it already was, continues untouched).
15. **The active locale is read the same way `OceanScene.tsx` resolves it for render**:
    `selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.currentLocaleId`, then
    `useLocaleStore.getState().getLocaleById(localeId)?.robots ?? []` (the exact helper
    `workLoop.ts`'s own `robotsOf` already uses) — read fresh inside the ticker and inside `pick()`,
    never cached, since the fleet's battery levels and docking states change continuously.

## 1. Overview & Claude Explanation

### 1.1 Module state (`src/animation/deckCamera.ts`, rewritten)

Replaces the shipped idle/cut state with:

```ts
let scroller: HTMLElement | null = null;
let held = false;                          // a pointer/touch is currently down
let subjectId: string | null = null;       // the robot being followed, if any
let followStartedAt = -Infinity;           // performance.now() when the current follow began
let cooldownStartedAt = -Infinity;         // performance.now() when the last follow/override ended
let lastSelectedKind: 'robot' | 'company' | null = null;
let lastSelectedRobotId: string | null = null;
let lastSelectedCompanyId: string | null = null;
let tickerHandler: (() => void) | null = null;
let uiUnsubscribe: (() => void) | null = null;
```

`cooldownStartedAt = -Infinity` is the boot sentinel (assumption-equivalent of the shipped
`lastCutAt = -Infinity`): `performance.now() - cooldownStartedAt` is always ≥
`DECK_CAMERA_COOLDOWN_MS`, so the very first tick picks immediately.

### 1.2 The ticker (one `gsap.ticker.add` handler, registered in `registerDeckScroller`)

Each tick, in order:

1. If `held`, do nothing — no clock advances, no write happens.
2. Else if `subjectId` is set (following or mid-float — the float's own tween already owns the
   scroll position while it runs, so the tick's write is skipped while a `deck-camera` timeline is
   still registered/running; it only writes once the float has completed):
   - Look up the subject's `docking`. If `Active` or `Recalled`, write
     `scroller.scrollLeft = targetFor(subjectId)` (clamped, as today). If `Docked`, call
     `endFollow()`.
   - Else (still `Active`/`Recalled`) if `performance.now() - followStartedAt >= DECK_CAMERA_FOLLOW_MS`,
     call `endFollow()`.
3. Else (no subject, cooling down or at boot): if
   `performance.now() - cooldownStartedAt >= DECK_CAMERA_COOLDOWN_MS`, call `pick()` with the
   unfiltered candidate pool (all undocked robots in the active locale). An empty pool restarts the
   cooldown clock itself (§1.3) rather than being retried the very next tick.

`endFollow()` kills any `deck-camera` timeline still registered, clears `subjectId`, and sets
`cooldownStartedAt = performance.now()`.

### 1.3 Picking and floating

```ts
function pick(candidateIds: readonly string[]): void {
  const pool = candidateIds.length > 0 ? candidateIds : /* assumption 10c equivalent, see below */ [];
  // ...
}
```

- `pick(candidateIds)`: given a pool already filtered to undocked (`Active`/`Recalled`) robots
  (assumption 1), prefers the lowest `batteryLevel` among `batteryLevel > 50`; if that sub-pool is
  empty, falls back to the lowest `batteryLevel` across the whole pool; ties broken by proximity to
  the scroller's current viewport centre (assumption 3). An empty pool (e.g. every robot docked) is
  a no-op that also restarts the cooldown clock (`cooldownStartedAt = performance.now()`) — the
  next attempt is another full `DECK_CAMERA_COOLDOWN_MS` later, not next tick (Crawford, 2026-10-11;
  resolves what was Open Question Q3 in the first draft of this spec).
- On a winner: builds and plays the existing float tween (`createCameraTween`, unchanged —
  `DECK_CAMERA_PAN_S`, `power1.inOut`, instant under `prefers-reduced-motion`), and its `onComplete`
  sets `subjectId = winner`, `followStartedAt = performance.now()`. `onInterrupt` (an override
  arriving mid-float) does the same — the interrupting caller is responsible for having already
  called `pick`/forced the right winner before the new tween starts.
- The normal cooldown-expiry path calls `pick(allUndockedRobotIds)`. The two overrides call it
  with narrower or forced inputs (§1.4).

### 1.4 The three overrides

All three share one `forceFollow(id)` helper: kill anything running (`killTimeline`, clear
`subjectId`/cooldown state), build the float tween to `id`, same `onComplete` as `pick()`'s.

- **User touch** (`pointerdown`/`touchstart`/`wheel` on the scroller): sets `held = true`
  immediately and calls `killTimeline(DECK_CAMERA_TIMELINE_ID)` (stops a float dead; a raw
  continuous-tracking write just stops next tick because `held` guards it). `pointerup`/`touchend`
  (or, for `wheel`, the same handler fired immediately after) sets `held = false` and
  `cooldownStartedAt = performance.now()`, `subjectId = null` — i.e. touch always ends any follow
  in progress, never resumes it.
- **Robot edit-return**: the `useUIStore.subscribe` callback updates `lastSelectedRobotId`/
  `lastSelectedKind` on every non-null `selectedRobotId` write. On the `activeHubTile` edge
  (non-null → `null`), if `lastSelectedKind === 'robot'` and that robot's `docking` is `Active` or
  `Recalled`, call `forceFollow(lastSelectedRobotId)`. Otherwise do nothing.
- **Company edit-return**: same subscribe shape for `selectedCompanyId`/`'company'`. On the same
  edge, if `lastSelectedKind === 'company'`, build that company's robot ids
  (`useLocaleStore`'s robots filtered by `companyId`), intersect with the undocked filter, and call
  `pick()` on that list (falling back to the full undocked list per assumption 13) followed by
  `forceFollow` on whatever it returns — i.e. this override reuses `pick()`+float, it does not pick
  a company member directly the way the robot override does.
- Both edit-return overrides consult `lastSelectedKind`/`lastSelectedRobotId`/`lastSelectedCompanyId`
  only once per `activeHubTile` edge and do not clear them afterward (a second, identical return to
  the Deck without reopening anything in between is not expected to re-trigger — `activeHubTile`
  would already be `null`, so there is no second edge to fire on).

### 1.5 What is removed

- `panDeckCameraTo`, `noteDeckUserInput`, `isDeckCameraIdle`, `__setDeckCameraScrolling`,
  `cameraScrolling`, the `scroll` listener (assumption 7).
- `DECK_CAMERA_IDLE_MS`, `DECK_CAMERA_CUT_COOLDOWN_MS` (renamed/repurposed — see §1.6),
  `DECK_CAMERA_STATION_CHANCE`.
- `src/systems/deckCameraTarget.ts` and its test (assumption 10).
- `onLifecycleChange`'s camera call in `workLoop.ts` (assumption 10).
- `PanToRobotButton`, `.robot-screen__pan`, `probe.band.panToRobot` (assumption 9).

### 1.6 Constants (`src/constants/deckCamera.ts`)

- `DECK_CAMERA_PAN_S = 1.4` — unchanged, the float-in rate.
- `DECK_CAMERA_TIMELINE_ID = 'deck-camera'` — unchanged.
- `DECK_CAMERA_FOLLOW_MS = 20000` — new; how long a follow lasts before cooling down on its own.
- `DECK_CAMERA_COOLDOWN_MS = 8000` — replaces `DECK_CAMERA_CUT_COOLDOWN_MS` (was `20000` with a
  different meaning — "don't cut again this soon"; this is "how long to rest between subjects").
- `DECK_CAMERA_MIN_BATTERY_PCT = 50` — new; the `pick()` preference threshold.

### 1.7 What does not change

- The fit, the horizontal scroller, and the scroll-snap removal already on this branch.
- `targetFor`/`deckCameraTargetFor`, `createCameraTween`'s tween shape (`DECK_CAMERA_PAN_S`,
  `power1.inOut`, reduced-motion → duration 0), `registerDeckScroller`'s roles as the scroller
  registry and `timelineMap` owner.
- Selection, the halo, `selectEntity`/`selectRobot`/`selectCompany` themselves (only observed, never
  called, by this module), `Robot.tsx`'s `handleClick`.
- The audio path: nothing here imports `AudioEngine`; no ticker tick or tween callback calls it.
- The session payload, the share link, `WORLD_BOUNDS`.

## 2. Target File Structure

```text
src/
├── animation/
│   ├── deckCamera.ts                  REWRITTEN — follow/cooldown/pick/ticker, overrides
│   └── deckCamera.test.ts             REWRITTEN
├── constants/
│   └── deckCamera.ts                  CHANGED — see §1.6
├── systems/
│   ├── deckCameraTarget.ts            DELETED
│   ├── deckCameraTarget.test.ts       DELETED
│   ├── workLoop.ts                    CHANGED — onLifecycleChange no longer calls the camera
│   └── workLoop.test.ts               CHANGED — the 'active'-cuts-camera cases removed
├── components/panels/screen/screens/
│   ├── RobotScreen.tsx                CHANGED — PanToRobotButton removed, bare AvatarGem
│   ├── RobotScreen.css                CHANGED — .robot-screen__pan removed
│   └── RobotScreen.test.tsx           CHANGED — pan-tap tests removed
├── content/copy/probe.ts              CHANGED — probe.band.panToRobot removed
├── stores/
│   └── uiStore.ts                     READ ONLY — activeHubTile/selectedRobotId/selectedCompanyId
└── docs/
    └── deckCameraFollowDocs.test.ts   (new) doc/code name guard, the layoutReworkDocs pattern
docs/
├── ANIMATION_SYSTEM.md                "Deck camera" section rewritten for the follow loop
├── UI_SHELL.md                        unchanged (the Deck paragraph already covers the scroller)
├── PERFORMANCE.md                     new gate rows for this phase
└── todo/roadmap.md                    46: decisions, status
```

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. `Robot.tsx`, `robotSystems.ts`, every scene layer component,
  and the audio path are read, not edited.
- **No timers.** Every clock is a `performance.now()` timestamp comparison, read inside the
  `gsap.ticker` handler. No `setTimeout`, `setInterval`, `requestAnimationFrame` or
  `queueMicrotask` anywhere in this phase (CLAUDE.md).
- **GSAP owns the motion.** The float is a timeline in `timelineMap`, killed on override/touch and
  on unmount, per `docs/ANIMATION_SYSTEM.md`. The continuous tracking write is a `gsap.ticker`
  handler (assumption 6), not a bespoke `requestAnimationFrame` loop.
- **Semantic/state triggers only.** The camera reacts to `docking`/`batteryLevel` (store reads) and
  `uiStore` selection fields, and to raw DOM input events on the scroller it owns — nothing here
  reads audio state or calls `AudioEngine` (Strict Separation guardrail).
- **Runtime-only.** No camera field in any Zustand store; all new module state (§1.1) is a plain
  module variable, same as the shipped module.
- **Content layer.** No new display strings are introduced by this phase (tap-to-pan's own entry is
  being deleted, not replaced).
- **Dependencies:** none added.
- **Ask first:** changing `DECK_CAMERA_FOLLOW_MS`/`DECK_CAMERA_COOLDOWN_MS`/
  `DECK_CAMERA_MIN_BATTERY_PCT` from the values above once shipped and tuned.
- **Never:** reintroduce tap-to-pan or any other manual "jump to this robot" control; filter
  candidates by screen position/viewport visibility (assumption-driven: "undocked" is a lifecycle
  check, never an on-screen check).

## 4. Code Style & Architecture Conventions

```ts
// src/animation/deckCamera.ts — the shape of the new pieces, not the whole file
function endFollow(): void {
  killTimeline(DECK_CAMERA_TIMELINE_ID);
  subjectId = null;
  cooldownStartedAt = performance.now();
}

function tick(): void {
  if (held) return;
  if (subjectId) {
    const robot = findRobot(subjectId);
    if (!robot || robot.docking === DockingState.Docked) {
      endFollow();
      return;
    }
    if (performance.now() - followStartedAt >= DECK_CAMERA_FOLLOW_MS) {
      endFollow();
      return;
    }
    const x = targetFor(subjectId);
    if (x !== null && scroller) scroller.scrollLeft = x;
    return;
  }
  if (performance.now() - cooldownStartedAt >= DECK_CAMERA_COOLDOWN_MS) {
    pick(undockedRobotIds()); // a pool of 0 restarts cooldownStartedAt itself — see pick()
  }
}
```

- Plain named exports, explicit types, no classes — matches the shipped module.
- Tests capture the `gsap.ticker.add` handler the way they already capture `gsap.timeline()`'s
  `to` vars (a recording mock), then invoke it manually with a mocked `performance.now()` — no real
  ticker runs in Vitest.
- `findRobot`/`undockedRobotIds` are small local helpers over `useLocaleStore.getState()`
  (assumption 15), not new store selectors — this module is not a React component and has never
  used hooks.
- Comments cite the spec section the way the shipped module's comments cite
  `MOBILE_DECK_CAMERA.md`.

## 5. Testing & Verification Requirements

### 5.1 Unit (Vitest, colocated)

- `deckCamera.test.ts` (full rewrite of the shipped file's follow/cut tests; the scroll-snap tests
  added in the previous session's work stay, untouched):
  - **Touch/release:** `pointerdown`/`touchstart` kills a running float and freezes continuous
    tracking; `pointerup`/`touchend` starts an 8 s cooldown; a bare `wheel` event does both at once.
  - **Follow duration:** a subject still `Active`/`Recalled` after `DECK_CAMERA_FOLLOW_MS` ends the
    follow and starts cooldown; one millisecond short does not.
  - **Dock ends early:** a subject whose `docking` becomes `Docked` before 20 s ends the follow
    immediately, at any tick; `Recalled` does not end it.
  - **Cooldown → pick:** after `DECK_CAMERA_COOLDOWN_MS`, a candidate is picked and floated to; one
    millisecond short, nothing happens.
  - **Pick algorithm:** lowest `batteryLevel` among `> 50` wins when any exist; falls back to lowest
    overall when none do; a tie resolves to whichever candidate's target is closer to the current
    viewport centre; `Docked`/`Undocking` robots are never candidates; an empty pool is a no-op
    (`subjectId` stays `null`, no tween built) that restarts `cooldownStartedAt` — the next pick
    attempt is a full `DECK_CAMERA_COOLDOWN_MS` later, not the very next tick.
  - **Boot:** the very first tick picks immediately (no initial 8 s wait).
  - **Edit-return (robot):** a `selectedRobotId` write followed by `activeHubTile` going non-null
    then `null` forces a float to that robot, bypassing cooldown, when it is `Active`/`Recalled`; no
    override when it is `Docked`/`Undocking`; selecting robot A then robot B before returning acts
    on B only; selecting a robot without ever returning to the Deck (`activeHubTile` staying
    non-null) does nothing.
  - **Edit-return (company):** same edge, scoped candidate pool (company's undocked robots, falling
    back to all undocked robots when the company has none), same tie-break.
  - **Overrides interrupt:** an edit-return override firing mid-follow or mid-float kills what was
    running and starts its own float immediately.
  - Seed every robot fixture's battery/docking with distinct, non-default values (the parity-fixture
    rule) — two candidates at the same low battery proves nothing about the tie-break unless their
    positions also differ.
- `workLoop.test.ts`: the `'active'`-calls-`cutDeckCameraTo` cases (and the station/working-robot
  choice cases, assumption 10) are deleted, not replaced — nothing in `workLoop.ts` calls the camera
  anymore.
- `RobotScreen.test.tsx`: the pan-button test is deleted; a new (or adjusted existing) case confirms
  the avatar band/column render the bare gem with no button role.
- `src/docs/deckCameraFollowDocs.test.ts`: every file and export this spec names exists (the
  `layoutReworkDocs.test.ts` pattern), and fails on a renamed export (mutation check).

### 5.2 Gates (recorded in docs/PERFORMANCE.md)

1. **Idle-paint gate**, `npm run perf:idle`, this branch against `main`, same pinned session, three
   runs each, plus one round with the camera actively following (not idle) to capture the ticker's
   steady-state cost — the shipped Task 11 gate measured a forced *cut*; this phase's camera is
   running continuously, so its resting cost matters more than any single transition's. Pass:
   median idle busy and paint within the noise band of the previous gates; the continuous-tracking
   round is recorded, not gated (same convention as the shipped Task 11's forced-cut round).
2. **Phone underrun A/B** on the Pixel in portrait, `?debug` overlay, same session link, three
   two-minute listens each on `main` and this branch — note the camera is now moving constantly
   (every ~20–28 s, floor-to-follow-to-cooldown), not just on an occasional lifecycle event, so this
   A/B is a heavier test of the same risk than the shipped phase's. Pass: no rise in playback
   underruns beyond the run-to-run spread already recorded.

### 5.3 Manual (Crawford)

- Pixel, portrait, left untouched for a couple of minutes: the camera settles on a robot, holds it,
  drifts to the next, repeats — never two 20 s follows on the same robot back to back unless it's
  the only undocked one left, and it noticeably prefers low-battery robots over nearly-full ones.
- Touch the screen mid-follow: the camera stops dead where it is, not where it was headed. Release
  and wait: 8 s later it picks again (and a quick wheel scroll on desktop does the same, with no
  separate release).
- Watch a followed robot dock: the camera does not chase it into the station or hold on an empty
  port; it lets go and starts cooling down the moment the robot lands.
- Open a robot, wait a few seconds (not editing anything, just viewing), back out to the Deck: the
  camera jumps straight to it with no 8 s wait, if it's undocked; opening a currently-docked robot
  and returning changes nothing.
- Open company A, then company B, then back to the Deck: the camera follows a B member, never an A
  one. Open a company with every member docked: the camera follows some other undocked robot
  instead (the fallback), not nothing.
- Reduced motion: every float is an instant jump, never a slide; continuous tracking is unaffected
  (it was never a tween).

## 6. Git & Workflow Context

- Continues on `feature/deck-camera`. One commit per task, RED first, the TDD workflow in memory
  (`tdd-incremental-workflow`): stop and report at gates, the two in §5.2 included.
- Commit messages: short imperative sentences, with the attribution line the session reminder
  gives.
- Docs land in the same branch: `ANIMATION_SYSTEM.md`'s "Deck camera" section rewritten for the new
  loop, `PERFORMANCE.md`'s new gate rows, roadmap 46's status and decisions updated to describe the
  follow model rather than the idle-cut one.

## 7. Open Questions

- **Q1 Wheel as instant touch+release (assumption 8).** Confirmed by inference from the interview's
  touch/release rule, not stated directly for the desktop/wheel case. Recommendation: ship as
  written; revisit only if a mouse-wheel user finds the camera re-picks too eagerly between wheel
  ticks.
- **Q2 Tie-break reference point (assumption 3).** "Closest to the camera" could instead mean
  closest to the just-ended subject's last position rather than the viewport centre; the two agree
  whenever the camera isn't mid-float when `pick()` runs, which is the common case (`pick()` only
  runs after a follow/cooldown has already settled). Recommendation: viewport centre, as written.
- **Q3 Docs test timing.** `deckCameraFollowDocs.test.ts` is new (the shipped phase's equivalent,
  Task 13 in `docs/tasks/MOBILE_DECK_CAMERA.md`, was never done); should it also absorb that
  original, still-pending doc work (the Deck camera section never written for the shipped fit/pan
  behavior), or stay scoped to just this phase's names? Recommendation: scope to this phase; the
  shipped-phase doc gap is pre-existing and not this spec's to close.
