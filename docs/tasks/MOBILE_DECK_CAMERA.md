# Implementation Plan: Mobile Deck Camera

Spec: [docs/specs/MOBILE_DECK_CAMERA.md](../specs/MOBILE_DECK_CAMERA.md). Intent:
[docs/intent/mobile-deck-camera.md](../intent/mobile-deck-camera.md). No sketch. Branch
`feature/deck-camera` from `main` (`26afd526`). Roadmap Phase 46.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`,
`npm run build`, `npm run dev`, `npm run perf:idle` (after `npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

Spec §7's five open questions are **not yet answered**. The plan builds the spec's
recommendations (quarter-mark proximity snap, 8 s / `'active'` only, desk gem too, tap only,
middle-80 % on-screen test) and names the task each answer would change, so a different answer
is a one-task edit, not a re-plan.

## Overview

Fourteen tasks in five phases. Phase 1 makes the world scroll with no camera: the aspect-ratio
stage box, the scroller element, the centred start, snap marks. It is the whole risk to the
idle-paint gate, so it goes first and Checkpoint A measures it before any camera code exists.
Phase 2 is the camera module, pure and testable with a stubbed GSAP and a fake scroller. Phase 3
wires the two triggers, each a vertical slice (gem tap → pan; lifecycle `'active'` → cut). Phase 4
is the two gates and Crawford's Pixel check. Phase 5 is docs. Every task leaves types, lint and
the suite green; RED first; one commit per task; every gate test is mutation-checked by breaking
the rule it guards (the idle window, the on-screen test, the camera-scroll flag) and watching it
fail.

## Architecture Decisions

- **Scroll first, camera second.** The scroller is a layout change to the six-layer stack that
  the 17.2.5, Phase 39, 43, 44 and 45 idle-paint gates all passed on; whether a scroll container
  changes how the browser composites those layers is the one unknown that could sink the phase.
  Measuring it alone (Checkpoint A) means a miss is attributed to the scroller, not to a tween.
- **The stage box is `height: 100%; min-width: 100%; aspect-ratio: 16 / 9`** (spec assumption 2).
  Every viewport at or wider than 16:9 is byte-identical to today; only narrower boxes overflow.
  No shell check, no media query.
- **The scroller is `div.world-view__scroller`, inside `.world-view`, around
  `AttenuationStyleView` only** (spec assumption 1); `MetaBox` stays a sibling, pinned.
- **The camera is a runtime module, `src/animation/deckCamera.ts`**, in the `timelineMap` /
  `refs.ts` shape: module variables, no React, no store. It tweens `scrollLeft` through GSAP's
  bundled `ScrollToPlugin` with `autoKill: true` (spec assumption 4). The timeline id is
  `deck-camera`; `setTimeline` replaces and kills the previous one.
- **Idle is a timestamp, never a timer** (spec assumption 8). `lastUserInputAt` is stamped by the
  scroller's `pointerdown`, `touchstart`, `wheel` and user `scroll` events; a `cameraScrolling`
  flag, set for the tween's lifetime, keeps the camera's own scroll events from counting.
- **Triggers are exactly two:** `onLifecycleChange(…, 'active')` in `workLoop.ts` and the gem
  button in `RobotScreen.tsx`. Nothing else imports the camera.
- **Robot x comes from GSAP, not the store** (spec assumption 5), the way `workLoop.ts:362`
  already reads it.
- **Reduced motion is an instant move, not no move** (spec assumption 9).

## Dependency Graph

```
T1 record intent+spec+plan
T2 constants ───────────────────────────────────────────────┐
T3 .ocean-scene aspect box + css test                       │
   └─► T4 scroller element + centred start + css/DOM tests  │
         └─► T5 snap marks                                  │
               └─► Checkpoint A (idle-paint, scroller only) │
T6 deckCamera: register/idle/target (fake scroller) ◄───────┘
   └─► T7 deckCamera: pan + cut tweens (stubbed gsap)
         └─► T8 WorldView hands the scroller to the module
               ├─► T9 content entry + gem button → pan   ─┐
               └─► T10 workLoop 'active' → cut           ─┼─► Checkpoint B (dev look)
                                                           │
T11 idle-paint gate (full)  ◄──────────────────────────────┘
T12 Pixel underrun A/B + Crawford's manual walk
T13 ANIMATION_SYSTEM / UI_SHELL / PERFORMANCE + docs test
T14 roadmap 46, intent/spec headers
```

## Task List

### Phase 1: The world scrolls (no camera)

## Task 1: Record the intent, spec and plan

**Description:** Create `feature/deck-camera` off `main` and commit the intent doc, the spec and
this plan as they stand, so every later diff is code.

**Acceptance criteria:**
- [ ] `git status` is clean on `feature/deck-camera` after the commit; no source file is touched.

**Verification:**
- [ ] `git log -1 --stat` lists exactly the three docs files.

**Dependencies:** None.

**Files:** `docs/intent/mobile-deck-camera.md`, `docs/specs/MOBILE_DECK_CAMERA.md`,
`docs/tasks/MOBILE_DECK_CAMERA.md`

**Estimated scope:** XS (docs commit)

## Task 2: `src/constants/deckCamera.ts` — the three constants

**Description:** `DECK_CAMERA_IDLE_MS = 8000`, `DECK_CAMERA_PAN_S = 0.8`,
`DECK_CAMERA_TIMELINE_ID = 'deck-camera'`, each with a one-line comment citing the spec
assumption it comes from. No importer yet. (Spec §7 Q2 changes `DECK_CAMERA_IDLE_MS` here and
nowhere else.)

**Acceptance criteria:**
- [ ] The three exports exist with those values and types (`number`, `number`, `string`).

**Verification:**
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/constants/deckCamera.ts`

**Estimated scope:** XS

## Task 3: `OceanScene.css` — the aspect-ratio stage box

**Description:** `.ocean-scene` becomes `position: relative; height: 100%; min-width: 100%;
aspect-ratio: 16 / 9;` (spec assumption 2, §1.1). The six `.ocean-scene__layer` rules are
untouched. Update the comment at the top of the file: the layers still share one box; that box is
now the stage, 16:9 or wider, never narrower. RED: the new `OceanScene.css.test.ts` case for the
box fails on the old rule.

**Acceptance criteria:**
- [ ] `OceanScene.css.test.ts`'s first case asserts `height: 100%;`, `min-width: 100%;`,
      `aspect-ratio: 16 / 9;` on `.ocean-scene` and no `inset: 0;`.
- [ ] The layer case and the moving-layer case pass unmodified.
- [ ] In the dev server at 1600 × 900 and at 1920 × 1080 the world is pixel-identical to `main`
      (same crop, same centre); at 375 × 812 the stage is wider than the viewport and
      `.world-view`'s `overflow: hidden` clips it to the same centred slice as today (because
      `.world-view` still hides overflow; the scroller comes in Task 4).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/worldView/OceanScene.css.test.ts` passes.
- [ ] Manual: the three viewport sizes above in the dev server, compared against `main`.

**Dependencies:** None.

**Files:** `src/components/panels/screen/worldView/OceanScene.css`,
`src/components/panels/screen/worldView/OceanScene.css.test.ts`

**Estimated scope:** S

## Task 4: `WorldView.tsx` / `WorldView.css` — the scroller, centred on mount

**Description:** Add `div.world-view__scroller` around `AttenuationStyleView` (not `MetaBox`),
with `position: absolute; inset: 0; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x
proximity; overscroll-behavior-x: contain; scrollbar-width: none;` and the webkit scrollbar rule
(spec §1.1, assumptions 1, 11). A `useCallback` ref on the element sets `scrollLeft` to
`(scrollWidth − clientWidth) / 2` once on mount (assumption 3). In Task 8 the same ref callback
also hands the element to the camera module; here it only centres. Rewrite `.world-view`'s long
comment: the box is still decoupled from the console grid (that reasoning stands), the scroller
inside it is what pans, and the "nothing ever needs to scroll" clause goes. Add
`WorldView.css.test.ts` (the `OceanScene.css.test.ts` pattern) for the scroller rule.

**Acceptance criteria:**
- [ ] `WorldView.test.tsx`: the scroller contains the attenuation-style view and not the meta
      box; the meta box is a direct child of `.world-view`.
- [ ] `WorldView.test.tsx`: with jsdom's `scrollWidth`/`clientWidth` stubbed to 2000 / 500 on
      the element, `scrollLeft` is 750 after mount (seeded with non-default values, the
      parity-fixture rule).
- [ ] `WorldView.css.test.ts`: the scroller rule carries `overflow-x: auto;`,
      `overflow-y: hidden;`, `scroll-snap-type: x proximity;`, `overscroll-behavior-x: contain;`.
- [ ] `data-dimmed` dimming still applies (the existing `WorldView.test.tsx` dim cases pass).
- [ ] Dev server at 375 × 812 (device toolbar, touch): the world starts on the same centred slice
      as `main`, swipes left and right with momentum, shows no scrollbar, and a swipe past the edge
      does not navigate the page.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/worldView/WorldView.test.tsx src/components/panels/screen/worldView/WorldView.css.test.ts` passes.
- [ ] Manual: the 375 × 812 check and a 1600 × 900 check (nothing scrolls, nothing moved).

**Dependencies:** Task 3.

**Files:** `src/components/panels/screen/worldView/WorldView.tsx`,
`src/components/panels/screen/worldView/WorldView.css`,
`src/components/panels/screen/worldView/WorldView.test.tsx`,
`src/components/panels/screen/worldView/WorldView.css.test.ts`

**Estimated scope:** S

## Task 5: `OceanScene.tsx` / `OceanScene.css` — snap marks

**Description:** Five empty `div.ocean-scene__snap` children of `.ocean-scene`, absolutely
positioned at `left: 0 / 25 / 50 / 75 / 100 %`, `width: 0; height: 100%; scroll-snap-align:
start; pointer-events: none;` (spec assumption 10). Rendered from a `SNAP_FRACTIONS` constant
array in `OceanScene.tsx`, not hand-written. (Spec §7 Q1 changes this task alone: a different
stride edits the array; "no snap" deletes the task and the `scroll-snap-type` line in Task 4.)

**Acceptance criteria:**
- [ ] `OceanScene.test.tsx`: exactly five `.ocean-scene__snap` elements, in order, with those
      `left` values; none inside any `<svg>` layer.
- [ ] `OceanScene.css.test.ts`: the snap rule has `scroll-snap-align: start;`,
      `pointer-events: none;`, `width: 0;`.
- [ ] Dev server at 375 × 812: a slow swipe that stops near a quarter mark settles on it; a fast
      fling stops wherever momentum ends if that is not near a mark (proximity, not mandatory).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/worldView/OceanScene.test.tsx src/components/panels/screen/worldView/OceanScene.css.test.ts` passes.
- [ ] Manual: the swipe check.

**Dependencies:** Task 4.

**Files:** `src/components/panels/screen/worldView/OceanScene.tsx`,
`src/components/panels/screen/worldView/OceanScene.css`,
`src/components/panels/screen/worldView/OceanScene.test.tsx`,
`src/components/panels/screen/worldView/OceanScene.css.test.ts`

**Estimated scope:** S

### Checkpoint A: The scroller alone (idle-paint)

- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] **Scroller-only idle-paint measurement**, the Phase 45 Task 29 gate's shape
      (docs/PERFORMANCE.md): production builds of `main` (`26afd526`) and the branch served side
      by side, one `?session=` pinned world, `npm run perf:idle --throttle 1 --only none --port
      9301`, foreground, one call at a time, orphaned-Chrome count 0 before and after, three rounds
      per build, order rotated, at the default width **and** at `--width 375` (the harness takes
      a width flag), since the scroller only overflows on the narrow run.
- [ ] DevTools Layers panel at 375 × 812: the three moving layers are still their own compositor
      layers inside the scroller; the three static ones are not promoted.
- [ ] Pass: median idle busy and Paint within each build's round-to-round spread. Miss: **stop
      and report**; the candidate fix is `contain: paint` or `will-change: scroll-position` on
      the scroller, tried one at a time, never both blind.
- [ ] Record the numbers in PERFORMANCE.md under a "Mobile Deck Camera — Checkpoint A" heading.

### Phase 2: The camera module (no importer)

## Task 6: `deckCamera.ts` — register, idle gate, target

**Description:** The module's state and pure parts (spec §1.2): `registerDeckScroller(el |
null)` (stores the element, attaches `pointerdown` / `touchstart` / `wheel` / `scroll` listeners
that call `noteDeckUserInput()` unless `cameraScrolling` is set, detaches them on `null`),
`noteDeckUserInput()`, `isDeckCameraIdle(now)`, and an internal `targetFor(robotId)` exported as
`deckCameraTargetFor` for tests: `x · (scrollWidth / WORLD_BOUNDS.width) − clientWidth / 2`,
clamped to `[0, scrollWidth − clientWidth]`, `null` when the ref or scroller is missing. No
tween yet; `gsap.registerPlugin(ScrollToPlugin)` is added in Task 7. Tests use a fake scroller
object (`{ scrollWidth, clientWidth, scrollLeft, addEventListener, removeEventListener,
dispatchEvent }`) and `setRef` with a stub `<g>` whose `x` is set via `gsap.set`.

**Acceptance criteria:**
- [ ] Idle at the boundary: with `lastUserInputAt` stamped at `t`, `isDeckCameraIdle(t + 7999)`
      is false and `isDeckCameraIdle(t + 8000)` is true; before any input it is true.
- [ ] A user `scroll` event stamps input; the same event while `cameraScrolling` is set does
      not (the flag is exported for the test as `__setCameraScrolling` or driven through Task 7's
      tween; this task may export a test-only setter and Task 7 replaces its use).
- [ ] `deckCameraTargetFor`: with the fake scroller at 3840 / 375 and a robot at scene x 960,
      the target is 1920 − 187.5 = 1732.5; at x 10 it clamps to 0; at x 1910 it clamps to 3465;
      with no ref it is `null`. (Seeded x values are non-default by construction.)
- [ ] `registerDeckScroller(null)` removes the four listeners (the fake records add/remove pairs).

**Verification:**
- [ ] `npx vitest run src/animation/deckCamera.test.ts` passes; mutation check: change `≥` to
      `>` in the idle gate and the boundary test fails.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 2.

**Files:** `src/animation/deckCamera.ts`, `src/animation/deckCamera.test.ts`

**Estimated scope:** S

## Task 7: `deckCamera.ts` — `panDeckCameraTo` and `cutDeckCameraTo`

**Description:** The tweens (spec §1.2, assumptions 4, 8, 9, §7 Q5). `panDeckCameraTo(robotId)`:
resolve the target, return on `null`; build `gsap.timeline({ paused: true })` containing
`gsap.to(scroller, { scrollTo: { x, autoKill: true }, duration, ease: 'power2.inOut' })` with
`onStart` setting `cameraScrolling = true` and `onComplete` / `onInterrupt` clearing it; register
under `DECK_CAMERA_TIMELINE_ID` with `setTimeline` (which kills the previous), play. Duration is
`0` when `matchMedia('(prefers-reduced-motion: reduce)').matches`, else `DECK_CAMERA_PAN_S`.
`cutDeckCameraTo(robotId)`: return when `!isDeckCameraIdle()`; return when the robot's centre
pixel `x · scale − scrollLeft` is inside the middle 80 % of `clientWidth` (already on screen);
else the same as pan. `registerDeckScroller(null)` now also calls `killTimeline(DECK_CAMERA_
TIMELINE_ID)`. `gsap.registerPlugin(ScrollToPlugin)` at import. Tests stub `gsap` the way
`BubbleStream.test.tsx` does and assert on the config passed to `gsap.to`.

**Acceptance criteria:**
- [ ] A pan while **not** idle still tweens; a cut while not idle does not call `gsap.to`.
- [ ] A cut to a robot whose centre is at 50 % of the window does nothing; at 5 % it tweens.
- [ ] Two pans in a row: `timelineMap.get('deck-camera')` is the second timeline and the first's
      `kill` was called.
- [ ] `cameraScrolling` is true between `onStart` and `onComplete` (drive the stubbed callbacks)
      and a `scroll` event in that window does not stamp user input; after `onInterrupt` it does.
- [ ] Reduced motion (stub `matchMedia`) passes `duration: 0`; otherwise `0.8`.
- [ ] `gsap.to` receives `scrollTo: { x: <target>, autoKill: true }`.
- [ ] `registerDeckScroller(null)` kills the registered timeline.
- [ ] Nothing in the module imports from `@/engine` or `@/stores` (a test greps the source: the
      `layoutReworkDocs` pattern applied to one file).

**Verification:**
- [ ] `npx vitest run src/animation/deckCamera.test.ts` passes; mutation checks: widen the 80 %
      band to 100 % and the 5 % case fails; drop the idle check and the not-idle cut case fails.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 6.

**Files:** `src/animation/deckCamera.ts`, `src/animation/deckCamera.test.ts`

**Estimated scope:** S

### Phase 3: The triggers (two vertical slices)

## Task 8: `WorldView.tsx` — hand the scroller to the camera

**Description:** Task 4's ref callback also calls `registerDeckScroller(el)` on mount and
`registerDeckScroller(null)` on unmount (spec §1.1). The centring stays in `WorldView` (it is
layout, not camera). With this task the camera module has a live scroller but no caller.

**Acceptance criteria:**
- [ ] `WorldView.test.tsx` (mock `@/animation/deckCamera`): mount calls
      `registerDeckScroller` once with the `.world-view__scroller` element; unmount calls it with
      `null`; a re-render in between calls neither again.
- [ ] A power-off/on cycle in the dev server (the off screen remounts the tablet) leaves no
      stale listener: `registerDeckScroller(null)` ran (log it once, remove the log before commit).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/worldView/WorldView.test.tsx` passes.
- [ ] `npm test` green (the module is now in the app bundle; nothing else should change).

**Dependencies:** Tasks 4, 7.

**Files:** `src/components/panels/screen/worldView/WorldView.tsx`,
`src/components/panels/screen/worldView/WorldView.test.tsx`

**Estimated scope:** XS

## Task 9: `probe.ts` + `RobotScreen.tsx` — the gem button pans

**Description:** Content entry `probe.band.panToRobot` in `src/content/copy/probe.ts`
(`human: 'Show on deck'`, `template: 'Show {name} on the deck'`, with the usual comment). In
`RobotScreen.tsx`, `AvatarGem` is wrapped in `<button type="button" className="robot-screen__pan"
aria-label={fill('probe.band.panToRobot', { name })} onClick={() => panDeckCameraTo(robot.id)}>`
in both `RobotAvatarBand` and `RobotAvatarColumn` (spec assumption 6, §1.3; §7 Q3 "phone only"
removes it from the column). `.robot-screen__pan` in `RobotScreen.css`: no border, no background,
`padding: 0`, the gem's fixed size so pressing never reflows, a visible `:focus-visible` ring in
the trait colour the screen already uses. The tap does nothing else.

**Acceptance criteria:**
- [ ] `RobotScreen.test.tsx` (mock `@/animation/deckCamera`): in the phone band and in the desk
      column a button named "Show <robot name> on the deck" exists; clicking it calls
      `panDeckCameraTo` with that robot's id; `selectedRobotId` and `activeHubTile` are unchanged
      after the click.
- [ ] `src/content/content.test.ts` and ESLint pass (no literal in the component).
- [ ] Dev server, 375 × 812: open a robot, tap its gem, go back to the Deck: that robot is
      centred. Desk at 1600 × 900: the button is Tab-reachable and named; the tap moves nothing
      visible.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx src/content` passes.
- [ ] Manual: the two checks.

**Dependencies:** Task 8.

**Files:** `src/content/copy/probe.ts`, `src/components/panels/screen/screens/RobotScreen.tsx`,
`src/components/panels/screen/screens/RobotScreen.css`,
`src/components/panels/screen/screens/RobotScreen.test.tsx`

**Estimated scope:** S

## Task 10: `workLoop.ts` — `'active'` cuts the camera

**Description:** In `onLifecycleChange` (`workLoop.ts:764`), after `robotOf` resolves the robot,
`if (to === 'active') cutDeckCameraTo(robotId);` (spec assumption 7, §1.3; §7 Q2 changes the
condition here). Nothing else in the loop changes.

**Acceptance criteria:**
- [ ] `workLoop.test.ts` (mock `@/animation/deckCamera`): with the loop running,
      `onLifecycleChange(LOCALE, id, 'active')` calls `cutDeckCameraTo(id)` once; `'recalled'`
      and `'docked'` call it never; with no loop running, or another locale, it is not called
      (extends the existing "does nothing" case at line 990).
- [ ] Dev server, 375 × 812, phone untouched for 8 s: a robot leaving its station cuts the view
      to it; swiping during the cut stops it where the finger is; a robot going active within 8 s
      of a swipe does not move the view.

**Verification:**
- [ ] `npx vitest run src/systems/workLoop.test.ts` passes.
- [ ] Manual: the three behaviours.

**Dependencies:** Task 8.

**Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`

**Estimated scope:** XS

### Checkpoint B: Crawford's dev look

- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] The spec §5.3 walk in the dev server's device toolbar at 375 × 812 and at 1600 × 900,
      and a share link opened at both sizes.
- [ ] **Stop and report.** Crawford answers spec §7 Q1–Q5 against the live thing; any change is
      the one task named beside each question.

### Phase 4: Gates

## Task 11: Idle-paint perf gate (full feature)

**Description:** Checkpoint A's shape again, on the finished branch against `main`, three rounds
each, plus one round with a camera cut forced inside the 6 s window (call `cutDeckCameraTo` from
the console on an off-screen robot after the warm-up) so a tween's cost is in the record even
though it is not the idle number.

**Acceptance criteria:**
- [ ] Pass: median idle busy and Paint within each build's round-to-round spread, and no worse
      than Checkpoint A's scroller-only numbers. The forced-cut round is recorded, not gated.
- [ ] Recorded in PERFORMANCE.md under "Mobile Deck Camera — the Task 11 perf gate (Phase 46)" in
      the Phase 45 table format.

**Verification:**
- [ ] **Stop and report** the numbers before any change.

**Dependencies:** Checkpoint B.

**Files:** `docs/PERFORMANCE.md`

**Estimated scope:** S (measurement)

## Task 12: Pixel underrun A/B and Crawford's manual walk

**Description:** Spec §5.2 gate 2 and §5.3: on the Pixel in portrait, `?debug` overlay, the same
`?session=` link, three two-minute listens each on `main` (GitHub Pages) and the branch (served
over the LAN or a preview deploy), each listen left untouched long enough for at least one cut.
Then the §5.3 walk on the phone: swipe, settle, cut, interrupt, gem tap, share link.

**Acceptance criteria:**
- [ ] Underruns on the branch within the run-to-run spread recorded for 17.2.6.
- [ ] Crawford signs off the walk, or names the change (snap stride and idle window are the
      likely ones; each is one constant).

**Verification:**
- [ ] Manual (Crawford). **Stop and report.**

**Dependencies:** Task 11.

**Files:** `docs/PERFORMANCE.md` (the underrun row); constants only if re-tuned.

**Estimated scope:** XS

### Phase 5: Docs

## Task 13: ANIMATION_SYSTEM / UI_SHELL / PERFORMANCE and the docs test

**Description:** ANIMATION_SYSTEM.md gains a "Deck camera" section: the module, the
`deck-camera` timeline, `ScrollToPlugin` with `autoKill`, the idle timestamp, the two triggers,
and the rule that nothing else may call it. UI_SHELL.md's Deck paragraph says the world view
scrolls horizontally where the cover fit crops, the meta box stays pinned, and that the scroller is
not a shell switch. PERFORMANCE.md already has the gate rows from Tasks 11–12; add the
Checkpoint A row's pointer to the "Recording a new baseline" list if that list enumerates gates.
`src/docs/mobileDeckCameraDocs.test.ts` (the `layoutReworkDocs.test.ts` pattern) checks that the
three docs and the spec name only files and exports that exist (`deckCamera.ts`'s five exports,
the three constants, `world-view__scroller`, `ocean-scene__snap`, `probe.band.panToRobot`).

**Acceptance criteria:**
- [ ] The docs test passes and fails when one named export is renamed in the doc (mutation
      check).
- [ ] CLAUDE.md's reference-doc line for ANIMATION_SYSTEM.md mentions the Deck camera.

**Verification:**
- [ ] `npx vitest run src/docs` passes.

**Dependencies:** Task 12.

**Files:** `docs/ANIMATION_SYSTEM.md`, `docs/UI_SHELL.md`, `docs/PERFORMANCE.md`,
`src/docs/mobileDeckCameraDocs.test.ts`, `CLAUDE.md`

**Estimated scope:** S

## Task 14: Roadmap 46, intent and spec headers

**Description:** Roadmap 46: mark built, record the §7 answers and any Checkpoint-B changes as
"Decisions made after the spec", keep the "Not Doing" list, add the two gate results in one line
each. Intent and spec headers gain the "Built … on `feature/deck-camera`" line in the
layout-rework intent's style.

**Acceptance criteria:**
- [ ] Roadmap 46 reads as a record, not a proposal; its table of the three fits stays as the
      reasoning.

**Verification:**
- [ ] `npx vitest run src/docs` passes (roadmap links resolve).

**Dependencies:** Task 13.

**Files:** `docs/todo/roadmap.md`, `docs/intent/mobile-deck-camera.md`,
`docs/specs/MOBILE_DECK_CAMERA.md`

**Estimated scope:** XS

### Checkpoint: Complete

- [ ] All spec §5.1 tests exist and pass; both §5.2 gates recorded; §5.3 walk signed off.
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` clean.
- [ ] A `code-review-and-quality` pass over the branch, then the PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| A scroll container changes how the six layers composite; the idle-paint gate misses | High | Scroller lands alone (Phase 1) and is measured at Checkpoint A before any camera code; Layers-panel check; `contain: paint` / `will-change: scroll-position` as the two one-at-a-time fixes |
| `scrollWidth` is read once at mount, before the layers have laid out, and the centre is wrong | Med | Task 4's test stubs sizes; the manual check compares the start slice to `main`; if it misfires, move the centring into the same `useGSAP`-style pre-paint effect the robots use, still once |
| The camera's own `scroll` events stamp user input and every cut cancels the next | Med | The `cameraScrolling` flag with `onStart` / `onComplete` / `onInterrupt`; Task 7's mutation check |
| `autoKill` fires on the camera's own first scroll frame and the tween dies at once | Med | ScrollToPlugin tolerates its own writes by design; Task 10's manual check catches it; fallback is a manual kill on the input listeners and `autoKill: false` |
| The desk gem button is a visible control that does nothing visible on most desks | Low | Spec §7 Q3; Task 9 names where it comes out |
| A re-rendered `WorldView` re-registers the scroller and leaks listeners | Low | Task 8's "re-render calls neither" test; `useCallback` with an empty dependency list |

## Open Questions

Spec §7 Q1–Q5, answered by Crawford at Checkpoint B against the live build. Until then the plan
builds the recommendations, and each answer is the one task named beside it above.
