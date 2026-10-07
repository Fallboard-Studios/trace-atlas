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
  onComplete?: (robotId: string) => void,
): gsap.core.Timeline
```

Constants: `SWIM_SPEED = 120` px/s (duration = distance / SWIM_SPEED) · `TILT_ANGLE = 5` degrees.

Robots have no discernible front (Roadmap Phase 40, `docs/specs/ORBITING_POLYGONS.md` §1.6) — no
`scaleX` flip, no `targetDirection` parameter, no orientation phase to wait on; propulsion starts
at position 0 every time. The gem-polygon robots (Roadmap Phase 39) also have no propeller, so
there is no rotation tween for one.

Sequence:
- Resolves the robot SVG via `getRef(`robot-${robot.id}`)`. **If the ref isn't registered yet**, the function still returns an (empty) timeline and schedules `onComplete` via `gsap.delayedCall(estimatedDuration, ...)` so callers waiting on the callback don't hang.
- Kills any existing `swim-${robot.id}` timeline, sets `transformOrigin: '50% 50%'` once (the tilt below rotates about the centre).
- Animates to the destination over `distance / SWIM_SPEED` seconds, starting at position 0.
- Applies a body tilt (`± TILT_ANGLE`, direction-dependent) that ramps in over the first 30% of the duration and back out over the last 30%.
- Stores the timeline in `timelineMap` under `swim-${robot.id}` and plays it (it's created `paused: true` so it can be registered before playing).

### Orbiter attach/detach — a worked key family
[src/components/robot/gem/useOrbiterMotion.ts](../src/components/robot/gem/useOrbiterMotion.ts)
(Roadmap Phase 40, `docs/specs/ORBITING_POLYGONS.md` §1.4) is a small reference for a hook that owns
several related keys per instance, not just one:

- **Master key** `orbiters-${context}-${robotId}` — one per rendered instance (the world and the
  avatar show the same robot at once; `setTimeline` kills a duplicate key on remount). It registers
  a lightweight `{ kill: () => {} }` stub, not a real `gsap.timeline()` — nothing is ever added to
  it, so a genuine timeline object would just be a standing, never-used GSAP allocation per robot
  per context. `timelineMap`'s contract only ever calls `.kill()` on what's stored, so a stub
  satisfies it.
- **Size-tween key** `orbiter-size-${context}-${robotId}` — `setTimeline` re-targets this one on
  every `size` dial edit rather than stacking a second tween, the standard "one key per concern"
  pattern this file's intro recommends.
- **No per-element key at all for the attach/detach hop itself** — each corner's `gsap.to()` is
  tracked in a local `Map<corner, killFn>` inside the closure, killed on unmount alongside the
  tracked keys above, but never registered in the shared `timelineMap`. A hook-local resource that
  never outlives its own effect doesn't need a globally-addressable key; only resources another
  module might need to find or kill (`killAllTimelines()` on a world transition, a debug inspector)
  belong in `timelineMap`.
- **Coordinating two sources of the same animation** — a spawn/despawn arc can be triggered by a
  live count-dial edit (queued, one at a time, via an `arcInFlightRef` boolean) *or* by the initial
  mount (every initially-shown corner flies in at once, deliberately not queued — a robot "powering
  up"). A plain `Set<number>` of busy corners, written at the start of either path and cleared on
  completion, is the single source of truth `reconcile()` checks before picking a target — cheaper
  and more robust than teaching the queued path's own boolean about the unqueued path's parallelism.

### Scene layers — what may move where
The ocean scene (`OceanScene.tsx`) is four stacked `<svg>` layers that share one viewBox and `xMidYMid slice` fit: static back (background + midground factories/scenery, the terrain ridge, the water column, depth gradients), moving bubbles, moving robots, static front (foreground factories/scenery). The moving layers carry `will-change: transform` (OceanScene.css) and are compositor layers of their own, so a per-frame transform write repaints only them. This is a roadmap 17.2.5 finding, not a style choice: with everything in one `<svg>`, every GSAP write re-rasterized all sixty factories at full viewport size on every frame. Two rules follow:

`TerrainLayer` (the ridge/ground polygons) and `WaterColumn` (the gradient + surface glow) are
static-layer content, same as the factories: both re-fill on the once-a-second lighting tick only
(`activeLocaleLocalTime` → `getLighting`, whole-percent rounding), never per frame and never via a
CSS `transition` (roadmap Phase 42, docs/specs/WORLD_VIEW_DISTRICTS.md §1.3/§1.5).

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
