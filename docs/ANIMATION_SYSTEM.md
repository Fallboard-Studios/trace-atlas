# Animation System Guide

## Overview
Animation in Trace Atlas is driven by GSAP and SVG transforms. The runtime is centered around a small set of helpers rather than a large abstraction layer:

- [src/animation/timelineMap.ts](../src/animation/timelineMap.ts) manages timeline lifecycle
- [src/utils/refs.ts](../src/utils/refs.ts) stores top-level SVG refs for helpers outside React
- [src/animation/swimAnimation.ts](../src/animation/swimAnimation.ts) contains the current reusable robot swim timeline pattern

## Core Architecture

### Timeline registry
The timeline registry is a simple string-keyed map:

```typescript
export function setTimeline(id: string, timeline: Timeline): void {
  const existing = timelineMap.get(id);
  if (existing) {
    existing.kill();
  }

  timelineMap.set(id, timeline);
}

export function killTimeline(id: string): void {
  const timeline = timelineMap.get(id);
  if (timeline) {
    timeline.kill();
    timelineMap.delete(id);
  }
}
```

Two more exports exist alongside these: `getTimeline(id): Timeline | undefined` (plain lookup, no side effect) and `killAllTimelines(): void` (kills and clears every entry — used for full teardown/reset).

This is the supported pattern for keeping timelines out of React state and cleaning them up reliably.

### Ref registry
Top-level components register SVG elements with `setRef(key, element)` and animation helpers read them later with `getRef(key)`. This is how modules such as swim animation and interaction systems find robot DOM nodes without coupling them to React render state. Two cleanup exports also exist: `deleteRef(key): void` (remove one) and `clearRefs(): void` (remove all — testing/reset).

## Current Runtime Pattern

### Swim animation
The reusable animation helper is [src/animation/swimAnimation.ts](../src/animation/swimAnimation.ts):

```typescript
function createSwimTimeline(
  robot: Robot,
  destination: Vec2,
  targetDirection: 'left' | 'right',
  onComplete?: (robotId: string) => void,
): gsap.core.Timeline
```

Constants: `SWIM_SPEED = 120` px/s (duration = distance / SWIM_SPEED) · `TILT_ANGLE = 5` degrees · `ORIENTATION_DURATION = 0.5` s · `PROPULSION_OVERLAP = 0.2` s · `PROPELLER_ROTATION_SPEED = 2` s per 360°.

Sequence:
- Resolves the robot SVG via `getRef(`robot-${robot.id}`)`. **If the ref isn't registered yet**, the function still returns an (empty) timeline and schedules `onComplete` via `gsap.delayedCall(estimatedDuration, ...)` so callers waiting on the callback don't hang.
- Kills any existing `swim-${robot.id}` timeline, then flips orientation (`scaleX`) over `ORIENTATION_DURATION` only if direction actually changed.
- Animates to the destination over `distance / SWIM_SPEED` seconds, starting at `propulsionStart = needsFlip ? ORIENTATION_DURATION - PROPULSION_OVERLAP : 0`. **`propulsionStart` must be an absolute timeline position, not a relative offset like `"-=0.2"`** — relative offsets drift as more tweens are added to the timeline and cause it to grow past the intended swim duration. This was a real bug; don't reintroduce it.
- Rotates `.propeller` (if present) continuously for `ceil(duration / PROPELLER_ROTATION_SPEED)` full turns, in parallel with the movement tween.
- Applies a body tilt (`± TILT_ANGLE`, direction-dependent) that ramps in over the first 30% of the duration and back out over the last 30%.
- Stores the timeline in `timelineMap` under `swim-${robot.id}` and plays it (it's created `paused: true` so it can be registered before playing).

### Scene layers — what may move where
The ocean scene (`OceanScene.tsx`) is four stacked `<svg>` layers that share one viewBox and `xMidYMid slice` fit: static back (background + midground factories, depth gradients), moving bubbles, moving robots, static front (foreground factories). The moving layers carry `will-change: transform` (OceanScene.css) and are compositor layers of their own, so a per-frame transform write repaints only them. This is a roadmap 17.2.5 finding, not a style choice: with everything in one `<svg>`, every GSAP write re-rasterized all sixty factories at full viewport size on every frame. Two rules follow:

- Anything that moves every frame goes in a moving layer (robots in the robots layer, bubbles in `BubbleLayer`), never inside the static factory layers.
- No CSS `transition`/`animation` on scene SVG fills or attributes — a running transition style-invalidates its element every frame, which is how the old `fill 4.8s` lighting fade kept the whole scene repainting. Lighting steps once a second instead.

Measure with `npm run perf:idle` before and after any change to what moves in the scene (docs/PERFORMANCE.md, "Idle paint & composite").

### UI and system animations
Other systems follow the same model:

- [src/components/ui/physical/PowerRockerSwitch.tsx](../src/components/ui/physical/PowerRockerSwitch.tsx) for SVG button/transport animations
- [src/components/actors/BubbleStream.tsx](../src/components/actors/BubbleStream.tsx) for looping particle effects
- [src/systems/removeSystem.ts](../src/systems/removeSystem.ts) for exit animations

These modules register timelines in the shared map and clean them up during teardown.

## Contributor Rules

- Keep timelines and refs outside Zustand and React state.
- Prefer GSAP timelines over `setInterval` or `requestAnimationFrame` for motion.
- Use transforms such as `x`, `y`, `rotation`, and `scale` rather than layout properties.
- Keep semantic state changes in handlers; do not schedule audio directly inside GSAP timeline callbacks.
- Kill timelines on unmount or teardown when the owning entity is removed.

## What to Avoid

- Storing timelines in component state or Zustand
- Creating one-off animation loops with `requestAnimationFrame`
- Animating `width`, `height`, or other layout-affecting properties
- Triggering audio directly from timeline callbacks
- Leaving timelines running after cleanup

## Audit Checklist

- [ ] Timeline references live in the shared registry
- [ ] SVG refs are registered through `setRef` / `getRef`
- [ ] Cleanup uses `killTimeline` when the entity is removed
- [ ] Motion uses GSAP transforms instead of layout changes
- [ ] Audio scheduling stays outside animation callbacks
