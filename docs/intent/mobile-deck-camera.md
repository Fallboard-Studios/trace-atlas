# Intent: Mobile Deck Camera

Confirmed via `interview-me` on 2026-10-11, ahead of a `spec-driven-development` pass.
Roadmap entry: [46](../todo/roadmap.md#46-mobile-deck-camera-the-world-crop-on-phones). The layout rework
([45](../todo/roadmap.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen)) is merged, so the
sequencing note in that entry ("before the layout-rework plan is locked") is spent; this phase builds on the
merged Deck and the Robot screen's phone avatar band.

## Outcome

The world keeps its 1920 × 1080 cover fit on every viewport and the Deck's world view becomes a native
horizontal scroll-snap pan, plus a **camera** that brings a robot on screen: tapping a robot in the Robot
screen's phone avatar band (`RobotAvatarBand` in `RobotScreen.tsx`) pans the window to that robot, and the
work loop's lifecycle events (the Phase 43 `onLifecycleChange` seam in `workLoop.ts`) cut the window to a
robot while the camera is idle.

The problem it solves (Crawford, 2026-10-09, 2026-10-11): on a portrait phone the cover fit shows about 28 %
of the world's width, so most of the twelve robots are off screen while audibly playing. The thing users
miss is the robots, not the scenery.

## Behavior

- **Fit.** The stage stays 1920 × 1080 with `preserveAspectRatio="xMidYMid slice"` in `OceanScene.tsx`'s
  `SceneLayer`. No letterbox on portrait phones: the ~12 px robot of a 16:9 contain fit loses the gem
  facets, lit lines and halos (Phases 39, 41, 44). Landscape phones and tablets already approximate the
  desktop fit and need nothing special.
- **Pan.** `WorldView` becomes a horizontal scroller with scroll snap, driven by the compositor; no
  per-frame JavaScript. All six stacked layers scroll as one container, so scene-to-pixel mapping is
  unchanged. The "nothing ever needs to scroll" comment in `WorldView.css` describes the old layout and
  is rewritten, not treated as a guardrail.
- **Tap to pan.** Tapping a robot in the Robot screen's phone avatar band moves the camera to that robot
  and leaves it there. Selection semantics do not change: tapping still opens the robot's screen as today;
  the camera position is where the Deck is when the user returns to it.
- **Semantic cuts.** The work loop's lifecycle changes (`'active' | 'recalled' | 'docked'`) may cut the
  camera to the robot concerned, but **only while the camera is idle**: the user has not touched the
  scroller recently. The exact idle window is for the spec.
- **The user always wins.** Any touch or scroll on the world view kills the running camera tween and the
  window stays where the user leaves it. The camera never yanks the view mid-swipe.
- **One code path everywhere.** The scroller and camera exist on every viewport; no user-agent sniffing and
  no phone-only branch. On a desktop frame where the cover fit crops little, there is simply little to
  scroll and nowhere for the camera to cut.
- **Share link and coordinates untouched.** Same coordinates show the same place on every device; the
  camera only chooses where the window starts. The session payload is untouched.

## Style / constraint

- Camera movement is one GSAP tween on the layer stack's scroll position or transform, registered in
  `timelineMap` and killed on touch and on unmount, in the pattern `docs/ANIMATION_SYSTEM.md` sets out.
- The camera is triggered by **semantic state only** (lifecycle events, the avatar-band tap). It never
  listens to the audio path and the tween never calls `AudioEngine` (Strict Separation guardrail).
- Camera position is **runtime-only**: not in Zustand, not in the session, not in the share link.
- A camera tween is a moving-layer change, so it goes through the idle-paint gate (`docs/PERFORMANCE.md`)
  and the Pixel underrun A/B on the `?debug` overlay, like every moving-layer change before it.
- The world's six-layer stack, depth tints and dimming under the content surface (`data-dimmed`) are
  unchanged.

## Success

On the Pixel in portrait, a robot whose lifecycle changes is on screen or one swipe away within seconds of
the change, with no new underruns on the debug overlay and the idle-paint gate passed. Share links open at
the same place as before.

## Out of scope

- **Idle drift** (roadmap 46 step 2): decoration, revisited only after the camera ships.
- **Schematic minimap / overview** (roadmap 46 step 4): overlaps the neighbourhood map, roadmap
  [47](../todo/roadmap.md#47-neighbourhood-map-coherent-districts-and-the-visited-log).
- **16:9 letterbox on portrait phones**, and anything to fill a letterbox band (telemetry strip, clock).
- **A portrait world** (re-placed recipes for a tall `WORLD_BOUNDS`): breaks "coordinates are the place".
- **Rendering the scene twice** (overview + zoom): doubles the static DOM.
- **A robot tap in the world** as a camera trigger: the world tap already selects and opens a branch; the
  avatar band is the tap-to-pan surface.

## Known implementation note (not yet spec'd)

- Whether the camera moves `scrollLeft` of the scroller (so snap and momentum stay native) or a transform
  on the layer stack with the scroller only for user input; both keep one container for all six layers.
- The idle window before a semantic cut is allowed, and which of the three lifecycle changes cut (likely
  `'active'` only; `'docked'` may be too frequent).
- How the avatar-band tap reaches the camera: a runtime module (like `timelineMap`) rather than a store
  field, since the position is not state.
- Scroll-snap points: per robot, per district, or a fixed stride across the 1920-wide stage.
- The tablet is a fixed-size shell; the scroller must not leak scroll to the page or fight the nav panel's
  edge gestures on the phone.
