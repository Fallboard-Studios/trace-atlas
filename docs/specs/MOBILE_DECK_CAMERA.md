# Phase Spec: Mobile Deck Camera

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

Roadmap Phase 46. Intent: [docs/intent/mobile-deck-camera.md](../intent/mobile-deck-camera.md)
(confirmed 2026-10-11; where this spec and the intent differ, the intent wins). No sketch: the
visible result is the existing world, panned. Branch `feature/deck-camera`, off `main`.

The world keeps its 1920 × 1080 cover fit everywhere. Where the cover fit crops the sides (a
portrait phone shows about 28 % of the stage's width), the Deck's world view becomes a **native
horizontal scroller** (compositor-driven, no per-frame JavaScript) and gains a **camera**: a tap on
the robot's gem in the Robot screen's avatar band pans the window to that robot, and the work
loop's `onLifecycleChange` seam cuts the window to a robot that goes active, but only while the user
has not touched the scroller recently. Any touch kills the camera. Camera position is runtime-only.

Every file, function and constant named below was checked against the working tree on 2026-10-11
(`main` at `26afd526`).

## Assumptions (correct these before the plan)

1. **The scroller is a new inner element, not `.world-view` itself.** `WorldView.tsx` renders
   `AttenuationStyleView` and `MetaBox` as siblings inside `.world-view`; the meta box must stay
   pinned at the top of the Deck, so the scroller is a new `div.world-view__scroller` wrapping
   `AttenuationStyleView` only. `.world-view` keeps `position: absolute; inset: 0; overflow: hidden`
   (its long comment is rewritten; the "nothing ever needs to scroll" line goes).
2. **The stage box is sized by aspect ratio, so today's fit is reproduced byte-for-byte where
   nothing scrolls.** `.ocean-scene` changes from `position: absolute; inset: 0` to
   `height: 100%; min-width: 100%; aspect-ratio: 16 / 9` inside the scroller. On a box at or wider
   than 16:9 (every desktop frame, landscape phones, tablets) `min-width: 100%` wins, the box is the
   viewport, and the six layers' `xMidYMid slice` crops top and bottom exactly as today. On a box
   narrower than 16:9 the stage is taller than wide, the scroller overflows horizontally, and
   `slice` on a box that is itself 16:9 is a no-op, so scene (x, y) → pixel mapping is one uniform
   scale: `scrollWidth / WORLD_BOUNDS.width` (`sceneDepth.ts:30`). The six `<svg>` layers keep
   `position: absolute; inset: 0; width/height: 100%` inside `.ocean-scene`, so
   `OceanScene.css.test.ts`'s layer contract holds; only the `.ocean-scene` rule changes, and that
   test's first case is updated with it.
3. **The scroller starts centred**, so an unpanned phone sees the same middle 28 % it sees today,
   and the share link opens on the same place as before. `scrollLeft` is set once on mount to
   `(scrollWidth − clientWidth) / 2`; `scrollWidth` is read then, not watched. A later camera
   move or user swipe owns the position from there.
4. **The camera tweens `scrollLeft` with GSAP's bundled `ScrollToPlugin`**, not a transform on the
   layer stack. One scroller for input and camera means native snap and momentum are never fought
   by a transform, and the plugin's `autoKill` is exactly "the user always wins": a wheel, touch or
   scroll from anywhere else kills the tween. `gsap/ScrollToPlugin` ships inside the `gsap` package
   already in `package.json`; no new dependency. The tween is created `paused: true`, registered
   in `timelineMap` under `deck-camera` (`setTimeline` replaces and kills any previous one,
   `timelineMap.ts:26`), then played.
5. **A robot's camera target is its live scene x**, read the way the work loop already reads it:
   `gsap.getProperty(getRef('robot-<id>'), 'x')` (`workLoop.ts:168, 362`), not the store's
   `robot.position`, which is the spawn position. Target `scrollLeft` is
   `x · scale − clientWidth / 2`, clamped to `[0, scrollWidth − clientWidth]`. A robot that is hidden
   in its station (`visibility: hidden`, Docked) still has an x; the camera may be asked for it and
   moves anyway, which is harmless because cuts fire on `'active'` (assumption 7).
6. **The tap-to-pan surface is the gem (`AvatarGem`) in `RobotAvatarBand` (`RobotScreen.tsx:364`)**,
   and, for one code path, the same gem in `RobotAvatarColumn` on the desk. The band is the one
   robot whose screen is open; it is not a roster. On the phone the Robot screen's opaque content
   surface covers the Deck (LAYOUT_REWORK §1.3), so the pan happens out of sight and is seen when the
   user returns to the Deck. The tap does not change selection or navigation: the gem becomes a
   `button` whose accessible name comes from a new `probe.band.panToRobot` content entry
   (`src/content/`; never a literal in the component).
7. **Semantic cuts fire on `'active'` only.** `onLifecycleChange` (`workLoop.ts:764`) receives
   `'recalled' | 'active' | 'docked'` from `robotSystems.ts:43, 276, 313`. A robot going active is
   the one the user hears start; recalled and docked are leaving, not arriving. The cut is a call
   from inside `onLifecycleChange` to the camera module, so the robot systems tick (the measure
   tick) keeps reaching the visual world through that one seam, as Phase 43 set up.
8. **"Idle" means no user scroll or touch on the scroller for `DECK_CAMERA_IDLE_MS` (8 000 ms).**
   The scroller's `scroll`, `pointerdown`, `wheel` and `touchstart` events each stamp a module-level
   `lastUserInputAt` with `performance.now()` (a timestamp, not a timer; no `setTimeout`). A camera
   tween's own scroll events must not count as user input: the module sets a flag for the tween's
   lifetime and the `scroll` listener ignores events while it is set. Before a cut the module checks
   `performance.now() − lastUserInputAt ≥ DECK_CAMERA_IDLE_MS`; otherwise the cut is dropped, not
   queued. A tap-to-pan is never idle-gated: it is the user asking.
9. **Reduced motion still moves the camera, instantly.** `prefers-reduced-motion: reduce` sets
   the tween duration to 0 (a `gsap.set`), so the Deck still shows the robot; the cross-fade of the
   world sliding is what reduced-motion users are spared, not the information.
10. **Scroll snap is `x proximity` at quarter-stage marks**, four empty `div.ocean-scene__snap`
    children of the scroller positioned at 0, ¼, ½, ¾ and the end of the stage width, each
    `scroll-snap-align: start`. Proximity, not mandatory, so a camera pan that lands on a robot
    between marks stays where it landed, and a swipe that stops near a mark settles on it. This is
    the one decision the plan should expect Crawford to revise (Q1).
11. **The phone's browser back-swipe is contained.** `overscroll-behavior-x: contain` on the
    scroller, so a swipe past the stage's edge does not navigate the page away. The phone shell's
    nav is a sheet opened by a button (LAYOUT_REWORK §1.2), not an edge gesture, so there is no
    gesture conflict to resolve.
12. **Camera position is not state and does not survive a remount.** Not in `uiStore`, not in the
    session payload or the share link. A power-off/on or a locale change remounts `WorldView`, which
    re-centres (assumption 3).

## 1. Overview & Claude Explanation

### 1.1 The scroller (`WorldView.tsx`, `WorldView.css`, `OceanScene.css`)

- `WorldView` renders:
  ```tsx
  <div className="world-view" data-dimmed={dimmed ? '' : undefined}>
    <div className="world-view__scroller" ref={registerScroller}>
      <AttenuationStyleView attenuationStyleId={currentAttenuationStyleId} />
    </div>
    <MetaBox />
  </div>
  ```
  `registerScroller` is a stable callback that hands the element to the camera module
  (`registerDeckScroller(el)` / `registerDeckScroller(null)`), attaches the user-input listeners
  and sets the initial centred `scrollLeft`. `AttenuationStyleView` and `LocaleView` are unchanged
  (both are `width/height: 100%` wrappers).
- `.world-view__scroller`: `position: absolute; inset: 0; overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x proximity; overscroll-behavior-x: contain; scrollbar-width: none;` plus
  `::-webkit-scrollbar { display: none }`. No visible scrollbar: the world is not a document.
- `.ocean-scene`: `position: relative; height: 100%; min-width: 100%; aspect-ratio: 16 / 9;`. The
  snap marks are absolutely positioned children of `.ocean-scene` at the five stage fractions.
- `.ocean-scene__layer` is unchanged. The `data-dimmed` filter rules in `WorldView.css` are unchanged
  (they select `.ocean-scene__layer` by class, not by ancestry depth).
- The six layers' `preserveAspectRatio="xMidYMid slice"` and the `SceneLayer` comment stay; the
  comment's "nothing scrolls" clause is rewritten to say the scroller scrolls the whole stack.

### 1.2 The camera module (`src/animation/deckCamera.ts`, new)

A runtime module in the pattern of `timelineMap` and `refs.ts`: module-level variables, no React,
no store. Exports:

- `registerDeckScroller(el: HTMLElement | null): void` — remembers the scroller (or forgets it),
  attaches/detaches the input listeners, centres on first registration, and kills `deck-camera`
  on `null`.
- `panDeckCameraTo(robotId: string): void` — the user's pan. Never idle-gated. Resolves the target
  (assumption 5); if the robot's ref or the scroller is missing, returns. Creates
  `gsap.to(scroller, { scrollTo: { x: target, autoKill: true }, duration: DECK_CAMERA_PAN_S,
  ease: 'sine.inOut', paused: true })`, wraps it in a timeline registered as `deck-camera`, plays
  it. Duration 0 under reduced motion. (Crawford, manual check after Tasks 9–10: the spec's
  original `power2.inOut` over `DECK_CAMERA_PAN_S = 0.8` read as a snap, not a pan; raised to
  `1.4`s with the gentler `sine.inOut`.)
- `cutDeckCameraTo(robotId: string): void` — the semantic cut. Returns without moving when the
  user is not idle (assumption 8) or when the target is already within the visible window (the
  robot is on screen; no cut to where we already are). Otherwise identical to the pan.
- `noteDeckUserInput(): void` — stamps `lastUserInputAt`. Exported for tests and for the
  scroller's listeners.
- `isDeckCameraIdle(now = performance.now()): boolean` — the gate, exported for tests.
- Constants: `DECK_CAMERA_IDLE_MS = 8000`, `DECK_CAMERA_PAN_S = 1.4`, `DECK_CAMERA_TIMELINE_ID =
  'deck-camera'`, in `src/constants/deckCamera.ts`.
- `gsap.registerPlugin(ScrollToPlugin)` happens once in this module, at import.

### 1.3 The triggers

- **Lifecycle cut:** `onLifecycleChange` (`workLoop.ts:764`) calls `cutDeckCameraTo(robotId)` when
  `to === 'active'`, after its existing robot lookup (`robotOf`) so a robot the loop does not know
  is ignored the same way. The call is fire-and-forget; the loop's own timelines are untouched.
- **Tap to pan:** the `AvatarGem` in `RobotAvatarBand` and `RobotAvatarColumn` is wrapped in a
  `<button type="button" className="robot-screen__pan" aria-label={labels('probe.band.panToRobot')}>`
  that calls `panDeckCameraTo(robot.id)`. No other behaviour on the tap. The button holds the gem's
  size (no reflow on press; `ui-controls-hold-largest-content-size` rule).

### 1.4 What does not change

- `OceanScene.tsx`'s six layers, their order, `SceneLayer`, the depth tints, `WaterColumn`,
  `LightShafts`, `TerrainLayer`, every robot and station timeline, the work loop's own motion.
- Selection, the halo, `selectEntity`/`selectRobot`, `Robot.tsx`'s `handleClick`.
- The audio path: nothing here imports `AudioEngine`, and no timeline callback calls it.
- `uiStore`, `localeStore`, the session payload, the share link, `WORLD_BOUNDS`.
- The desk shell's fit (nothing to scroll at 1600 × 900 and wider).

## 2. Target File Structure

```text
src/
├── animation/
│   ├── deckCamera.ts                  (new) scroller registry, pan, cut, idle gate
│   └── deckCamera.test.ts             (new)
├── constants/
│   └── deckCamera.ts                  (new) DECK_CAMERA_IDLE_MS, DECK_CAMERA_PAN_S, timeline id
├── components/panels/screen/worldView/
│   ├── WorldView.tsx                  scroller element, registerDeckScroller
│   ├── WorldView.css                  .world-view__scroller; comment rewrite
│   ├── WorldView.test.tsx             scroller present, meta box outside it
│   ├── OceanScene.tsx                 snap marks; SceneLayer comment
│   ├── OceanScene.css                 .ocean-scene aspect-ratio box; snap marks
│   └── OceanScene.css.test.ts         .ocean-scene rule updated
├── components/panels/screen/screens/
│   ├── RobotScreen.tsx                gem button in band and column
│   ├── RobotScreen.css                .robot-screen__pan
│   └── RobotScreen.test.tsx           tap calls panDeckCameraTo
├── content/copy/…                     probe.band.panToRobot
├── systems/
│   ├── workLoop.ts                    cutDeckCameraTo on 'active'
│   └── workLoop.test.ts               seam test
└── docs/
    └── mobileDeckCameraDocs.test.ts   (new) doc/code name guard, the layoutReworkDocs pattern
docs/
├── ANIMATION_SYSTEM.md                "Deck camera" section
├── UI_SHELL.md                        the Deck scrolls; meta box stays pinned
├── PERFORMANCE.md                     the two gate results
└── todo/roadmap.md                    46: decisions, status
```

## 3. Implementation Boundaries & Constraints

- **Strict scope:** only the files above. `Robot.tsx`, the robot systems tick and every other
  scene layer component are read, not edited.
- **No timers.** The idle gate is a timestamp comparison. No `setTimeout`, `setInterval`,
  `requestAnimationFrame` or `queueMicrotask` anywhere in this phase (CLAUDE.md).
- **Semantic triggers only.** The camera is called from `onLifecycleChange` and the gem button,
  nowhere else. It never reads audio state and no GSAP callback in it touches `AudioEngine`.
- **Runtime-only.** No camera field in any Zustand store; `registerDeckScroller` is the only place
  a DOM element is held, and it is a module variable, not state.
- **No device sniffing.** No `navigator.userAgent`, no `useShell()` in the camera or the scroller;
  the scroller exists on every viewport and simply has nothing to scroll on most desks.
- **Content layer.** The button's accessible name is a content entry read via `labels()`;
  `src/content/content.test.ts` and ESLint enforce it.
- **Dependencies:** none added. `ScrollToPlugin` is inside the installed `gsap` package.
- **Ask first:** changing the stage size, the layer count, or the layers' `preserveAspectRatio`.
- **Never:** render the scene twice, re-place recipes for a portrait world, add a letterbox.

## 4. Code Style & Architecture Conventions

```ts
// src/animation/deckCamera.ts — the shape, not the whole file
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { WORLD_BOUNDS } from '@/constants/sceneDepth';
import { DECK_CAMERA_IDLE_MS, DECK_CAMERA_PAN_S, DECK_CAMERA_TIMELINE_ID } from '@/constants/deckCamera';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { getRef } from '@/utils/refs';

gsap.registerPlugin(ScrollToPlugin);

let scroller: HTMLElement | null = null;
let lastUserInputAt = -Infinity;
let cameraScrolling = false;

export function isDeckCameraIdle(now = performance.now()): boolean {
  return now - lastUserInputAt >= DECK_CAMERA_IDLE_MS;
}

function targetFor(robotId: string): number | null {
  const el = getRef(`robot-${robotId}`);
  if (!el || !scroller) return null;
  const x = Number(gsap.getProperty(el, 'x'));
  const scale = scroller.scrollWidth / WORLD_BOUNDS.width;
  const max = scroller.scrollWidth - scroller.clientWidth;
  return Math.min(max, Math.max(0, x * scale - scroller.clientWidth / 2));
}
```

- Plain named exports, explicit types, no classes. Tests stub `gsap` the way `timelineMap`'s
  contract allows ("only ever calls `.kill()` on what's stored", ANIMATION_SYSTEM.md).
- CSS stays in the component's own file; no inline style objects except the snap marks'
  `left: <fraction>%`, which is computed.
- Comments cite the spec section the way the existing scene files do.

## 5. Testing & Verification Requirements

### 5.1 Unit (Vitest, colocated)

- `deckCamera.test.ts`: idle gate at the boundary (7 999 ms not idle, 8 000 ms idle); a cut while
  not idle moves nothing; a cut to an on-screen robot moves nothing; a pan while not idle still
  moves; the tween is registered as `deck-camera` and a second pan replaces the first; camera
  scroll events do not stamp user input while user scroll events do; `registerDeckScroller(null)`
  kills the timeline; target clamps at both ends; reduced motion gives duration 0. Seed the robot's
  x with a non-default value (the parity-fixture rule): a target computed from x = 0 proves nothing.
- `OceanScene.css.test.ts`: `.ocean-scene` has `height: 100%`, `min-width: 100%`,
  `aspect-ratio: 16 / 9`; the layer rule is unchanged.
- `WorldView.css` source test (new case in `WorldView.test.tsx` or a sibling `.css.test.ts`):
  the scroller rule has `overflow-x: auto`, `scroll-snap-type: x proximity`,
  `overscroll-behavior-x: contain`.
- `WorldView.test.tsx`: the scroller wraps the attenuation-style view and not the meta box;
  mount calls `registerDeckScroller` with the element, unmount with `null`.
- `RobotScreen.test.tsx`: the gem button exists in band and column with the content-entry name;
  clicking it calls `panDeckCameraTo(robot.id)` and does not change `selectedRobotId` or
  `activeHubTile`.
- `workLoop.test.ts`: `onLifecycleChange(…, 'active')` calls `cutDeckCameraTo` with the robot id;
  `'recalled'` and `'docked'` do not.
- `src/docs/mobileDeckCameraDocs.test.ts`: every file and export this spec names exists.

### 5.2 Gates (recorded in docs/PERFORMANCE.md)

1. **Idle-paint gate**, `npm run perf:idle`, this branch against `main`, same pinned session, 6 s
   idle window, 1×, `--only none`, three runs each. Pass: idle busy and paint within the noise band
   of the previous gates (Phase 44's table is the reference). The risk to watch: a scroll container
   can change how the browser composites the six absolutely positioned layers inside it; the
   `will-change: transform` promotion of the moving layers must still show as separate layers in
   the DevTools Layers panel.
2. **Phone underrun A/B** on the Pixel in portrait, `?debug` overlay, same session link, three
   two-minute listens each on `main` and this branch, during which at least one robot goes active
   and the camera cuts. Pass: no rise in playback underruns beyond the run-to-run spread recorded
   for 17.2.6.

### 5.3 Manual (Crawford)

- Pixel, portrait: the unpanned Deck shows the same middle slice as before; swiping pans with
  momentum and settles near a quarter mark; a robot going active while the phone is untouched cuts
  the view to it; swiping during a cut stops it dead; opening a robot and tapping its gem, then
  returning to the Deck, shows that robot centred.
- Desk at 1600 × 900: nothing scrolls, nothing looks different, the gem button does nothing
  visible but is focusable and named.
- A share link opens on the same place on both.
- Keyboard: the gem button is reachable by Tab; `prefers-reduced-motion` gives instant cuts.

## 6. Git & Workflow Context

- Branch `feature/deck-camera` off `main`. One commit per task, RED first, the TDD workflow in
  memory (`tdd-incremental-workflow`): stop and report at gates, the two in §5.2 included.
- Commit messages: short imperative sentences, with the attribution line the session reminder
  gives.
- Docs land in the same branch: ANIMATION_SYSTEM.md's "Deck camera" section, UI_SHELL.md's Deck
  paragraph, PERFORMANCE.md's gate rows, roadmap 46's status and decisions.

## 7. Open Questions

- **Q1 Snap stride.** Quarter-stage proximity marks (assumption 10), per-robot snap (moving
  targets; would need marks that follow the robots, which is per-frame work and is rejected), or
  no snap at all and let momentum settle anywhere? Recommendation: quarter marks, proximity.
- **Q2 Idle window and cut set.** 8 s and `'active'` only (assumptions 7, 8)? A shorter window
  makes the camera feel eager; `'docked'` cuts would pull the view to a station every time a robot
  comes home.
- **Q3 Desk gem.** Give the desk avatar column the same gem button (assumption 6, one code path),
  or phone band only?
- **Q4 Auto-pan on open.** Should opening a robot's screen pan the camera to it with no tap, so
  returning to the Deck always finds the robot you were just editing? The intent names the tap;
  the auto-pan would make the tap redundant. Recommendation: tap only, as confirmed.
- **Q5 On-screen test for cuts.** "Already within the visible window" (§1.2) uses the robot's
  centre; should a robot half off the edge count as on screen (no cut) or off (cut)? Recommendation:
  the centre must be inside the middle 80 % of the window, else cut.
