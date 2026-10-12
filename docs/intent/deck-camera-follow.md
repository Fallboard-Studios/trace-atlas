# Intent: Deck Camera — Continuous Follow

Confirmed via `interview-me` on 2026-10-11, ahead of a `spec-driven-development` pass.
**Built 2026-10-11 on `feature/deck-camera`** (roadmap [46](../todo/roadmap.md#46-mobile-deck-camera-the-world-crop-on-phones)); gate results are recorded there.
Roadmap entry: [46](../todo/roadmap.md#46-mobile-deck-camera-the-world-crop-on-phones). Supersedes the
tap-to-pan and idle-cut behavior described in [mobile-deck-camera.md](mobile-deck-camera.md) and shipped
in `src/animation/deckCamera.ts` on `feature/deck-camera` — this phase replaces that module's trigger
model with a continuous follow/cooldown/pick loop. The fit, scroller, and scroll-snap removal already
shipped on that branch are untouched and are not re-described here.

## Outcome

The deck camera stops waiting for something to happen and starts actively showing the user robots: it
continuously tracks one robot for a while, then hands off to another, forever, with the only interruptions
being the user's own touch and two deliberate "show me what I just changed" triggers from editing a robot
or company.

The problem it solves (Crawford, 2026-10-11): the shipped idle-cut model only moves the camera reactively
(a robot going active) and tap-to-pan doesn't work well in practice — you can't see what's happening in the
world while you're looking at a robot's own screen to tap it. The replacement makes the camera a constant,
self-directed presence instead of something that only reacts.

## Behavior

- **Follow.** The camera continuously tracks its current subject robot's live scene position every frame
  (driving `scrollLeft` from the robot's GSAP `x`, the way `targetFor`/`deckCameraTargetFor` already read
  it) — not a one-shot pan that then sits still while the robot swims away. Follow lasts up to 20 seconds,
  ending early only if the subject actually **docks** (the `'docked'` lifecycle event). Going `'recalled'`
  (in transit back to a station) does **not** end the follow early — the camera keeps tracking it, since a
  recalled robot is still swimming and the camera must be able to follow anywhere an undocked robot goes.
- **Cooldown.** Follow-end — by 20s elapsing, by docking, or by the user touching the scroller — starts an
  8-second cooldown (replacing the shipped 20s `DECK_CAMERA_CUT_COOLDOWN_MS`; this is the same clock, new
  value and new meaning — it is no longer "don't cut again too soon," it's "pause between subjects"). At
  boot, the cooldown is pre-elapsed: the very first pick happens immediately, no initial wait (same
  sentinel pattern as the shipped `lastCutAt = -Infinity`).
- **Pick.** When the cooldown elapses, select a new subject from the undocked robots (robots currently
  "swimming around" — not in the charging/docked lifecycle state; this is a lifecycle check, not an
  on-screen/viewport check — tapping a robot while it's off-screen is expected and is what the float in the
  next bullet is for):
  - Prefer the lowest-`batteryLevel` robot among those with more than 50% energy.
  - If no undocked robot has more than 50% energy, drop that filter and take the lowest-`batteryLevel`
    robot among all undocked robots.
  - Ties (equal lowest battery) break by whichever candidate is physically closest to the camera's current
    position.
- **Float, then follow.** Once a subject is picked (by cooldown-expiry, or by either override below), the
  camera eases to it at the same pan rate/ease as today's tap-to-pan tween (`DECK_CAMERA_PAN_S`,
  `power1.inOut`; instant under `prefers-reduced-motion`), then begins continuously following it per the
  Follow bullet above, with a fresh 20-second clock. The camera never re-evaluates candidates mid-follow —
  once picked, it stays until that follow ends.
- **User touch always wins.** A touch/pointerdown/wheel on the scroller kills whatever the camera is
  currently doing — mid-follow, mid-cooldown-wait, or mid-float — immediately, the same `autoKill`/kill
  pattern as today. On release, the 8-second cooldown restarts from zero, leading into a normal pick once
  it elapses. (This replaces the shipped idle-detection model — `noteDeckUserInput`/`isDeckCameraIdle` as a
  general "has the user been active recently" concept goes away; touch-down and touch-up become the only
  two input-driven events the camera cares about.)
- **Tap-to-pan is removed.** The avatar-band gem tap in `RobotScreen.tsx` no longer pans the camera. It
  didn't work well: the camera move happens behind the robot's own screen, invisible until the user backs
  out, which is exactly what the next two bullets replace it with, deliberately.
- **Edit-return override: robot.** `selectedRobotId` changes while a hub tile is open (browsing from robot
  to robot) have **no** camera effect — "if a user goes from robot to robot they'll never see the world
  view" (Crawford). Only the transition of `activeHubTile` back to `null` — the Deck becoming visible again
  — triggers anything, using whichever robot was *last* selected during that hub visit:
  - If that robot is undocked, it becomes the forced subject: skip cooldown and selection, float straight
    to it, and start a fresh 20-second follow.
  - If that robot is docked at that moment, there is no override — the camera proceeds exactly as if
    nothing had been selected (resume/continue whatever state it was already in). A docked robot can never
    become a forced subject, same as it can never be picked by the normal algorithm.
- **Edit-return override: company.** Symmetric to the robot case, keyed on `selectedCompanyId` and the same
  `activeHubTile → null` transition. Instead of forcing a specific robot, it runs the normal Pick algorithm
  scoped first to that company's undocked robots; if the company has none, it falls back to all undocked
  robots (then the usual >50%-else-everyone rule within whichever pool won). Float + fresh 20-second follow
  on the winner, same as any other pick.
- **Overrides interrupt anything.** Both edit-return overrides behave like a touch: they can fire mid-
  follow, mid-cooldown, or mid-float, and immediately take over from whatever the camera was doing.

## Style / constraint

- No `setTimeout`/`setInterval` for the 20s/8s clocks — timestamps compared on each check (the existing
  `performance.now()`-delta pattern `isDeckCameraIdle` already used), not raw timers (CLAUDE.md).
- The continuous Follow tracking needs a per-frame driver (GSAP ticker or equivalent), since it is no longer
  a single `ScrollToPlugin` tween to a fixed endpoint; the initial float-to-subject step still is one.
- Camera position/subject/clock state remains runtime-only (module-level in `deckCamera.ts`), never Zustand,
  session payload, or the share link — unchanged from the shipped module.
- The camera is triggered by semantic state only (lifecycle events, `uiStore` selection fields) — never
  reaches into `AudioEngine` (Strict Separation guardrail), same as the shipped module.
- GSAP timelines stay registered in `timelineMap` and killed on touch/unmount, per `docs/ANIMATION_SYSTEM.md`.

## Out of scope

- Any change to the fit, the horizontal scroller, or the scroll-snap removal already shipped on
  `feature/deck-camera` — this phase only replaces the trigger/selection logic.
- Screen-position/viewport visibility as a candidate filter — "undocked" is a lifecycle-state check, not an
  on-screen check; the whole point of the float step is that the next subject is often off-screen when
  picked.
- Reinstating tap-to-pan in any form, or any other manual "jump to this specific robot" control beyond the
  two edit-return overrides.
- Company and robot screens' own editing UI — this only concerns the handoff triggered by leaving them.

## Known implementation note (not yet spec'd)

- The exact mechanism for continuous per-frame tracking (GSAP's ticker, a `requestAnimationFrame` driven
  through GSAP, or a repeating zero-duration tween) and how it coexists with the one-shot float-in tween and
  `timelineMap` registration.
- How `activeHubTile`/`selectedRobotId`/`selectedCompanyId` transitions are observed from a non-React
  runtime module — a `uiStore.subscribe` in `registerDeckScroller`'s setup, most likely, mirroring how the
  module already avoids being a React component.
- Whether "closest to the camera" for tie-breaking means the current `scrollLeft` center or some other
  reference point.
- Where the undocked-robot list and battery values are read from (`useLocaleStore` directly, the same way
  `workLoop.ts` already reaches robot state from a non-React module).
