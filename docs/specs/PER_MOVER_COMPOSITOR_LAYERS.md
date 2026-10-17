# Phase Spec: Per-Mover Compositor Layers

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (Vitest; `npx vitest run <path>` for one file)
> - Idle-paint gate: `npm run build && npx vite preview --port 4173`, then
>   `npm run perf:idle -- --throttle 1 --only none --port 9301 --url <pinned ?session= link>`
>   (docs/PERFORMANCE.md, "The localizer"); this phase adds the `redrawn px²/frame` column it is gated on (§1.11)
> - Trace summary (any DevTools Performance JSON): `npm run perf:trace -- <file>`
> - Phone check: the `?debug` overlay's playback-underrun count on the Pixel, same `?session=` link, this branch
>   against `main` (docs/PERFORMANCE.md, "Diagnosing audio on a real phone")
> - Dev server: `npm run dev`

Roadmap Phase 53 (proposed; 52 is the last entry). Intent:
[docs/intent/per-mover-compositor-layers.md](../intent/per-mover-compositor-layers.md) (confirmed 2026-10-16; where
this spec and the intent differ, the intent wins). Diagnosis: backlog item 26 and
[PERFORMANCE.md](../PERFORMANCE.md#desktop-full-screen-underruns-are-raster-bound-2026-10-16). No sketch: the visible
result is the world exactly as it is; what changes is what the browser repaints to draw it.

**Dependency.** The Deck camera's idle no-op (backlog 26, candidate 2) is its own small test-first PR on its own branch and
is not a task of this phase. This phase branches from `main` after it is merged, so the baseline (§5.2) is taken without
the camera ticking, picking and drawing its marker at viewports with no scroll range.

Every file, function and constant named below was checked against the working tree on 2026-10-16 (`main`, HEAD
`6edcbcc7`).

## Assumptions (correct these before the plan)

1. **A positioned element with `will-change: transform` is its own compositor layer, and that layer's bounds follow the
   element's visual overflow.** A small `<svg>` with `overflow: visible` inside the wrapper therefore draws its halo waves
   (`WAVE_TRAVEL`, 90 units past the gem), its detached orbiters (as far as a building's roof outline) and its job
   decorations outside its box, and the layer grows to hold them. This is standard CSS and SVG behaviour, not a
   Chromium feature: `will-change` promotion and `overflow: visible` on an outer `<svg>` are in the specs and in
   Chromium, Firefox and WebKit alike; the app targets every modern browser (Crawford, 2026-10-16). **Task 1 verifies
   it in every browser on the machine before anything is built on it** — Chrome's Layers panel and Firefox's
   paint-flashing — and records which browsers were checked; a browser that clips instead gets the fallback, a wrapper
   box sized to the robot's largest reach (§7 Q1). Safari is unverified unless a device turns up.
   **Verified 2026-10-17 (Task 2 spike; the throwaway page is not committed):** Chrome 155 ✓ and Firefox ✓ (Firefox
   checked by eye by Crawford; its version was not recorded). In Chrome the wrapper is its own compositor layer, 251 × 122
   CSS px for a 100 × 80 box with a circle 90 units outside it, so the layer bounds do follow the overflow; the circle draws
   at every position and device scale (1×, 1.5×, 2×); a slide emits 0 `Paint` events. In both browsers, by eye, paint
   flashing shows nothing while a mover slides and only a small patch while its own content changes. Safari is unverified.
2. **GSAP writes a CSS transform on the wrapper, not an SVG `transform` attribute.** Verified in `gsap.js`:
   `_isSVG(e)` requires `e.ownerSVGElement` for any element with a parent, and a `<div>` (or an outer `<svg>`) has
   none. `x`, `y`, `rotation` and `scale` on the wrapper are composite-only writes.
3. **A layer under a scaled ancestor is rasterised at the scaled resolution**, so the stage container's one CSS
   scale (§1.1) leaves every sheet and mover as crisp as today's `viewBox` fit. Chromium and Firefox's WebRender
   both do this; WebKit has historically rasterised some composited layers at 1× and scaled them up. Task 1 checks
   it at 150 % and 200 % zoom in every browser on the machine, and a browser that blurs gets the fit applied to the
   sheets' `viewBox` and to each mover's own transform instead of to one ancestor (§7 Q1).
   **Checked 2026-10-17 (Task 2 spike): holds only in a weaker form, accepted by Crawford.** Chrome 155 does not draw a
   promoted mover as crisply as today's full-size sheet with the fit inside its `viewBox`. Against a plain viewBox svg
   (stroke darkness of a 1 px circle, lower is darker): at 1× today's sheet reads 88 and is pixel-identical to the
   reference, the mover under the scaled stage 105; at 1.5× 68 and 99 (reference 48); at 2× on a fractional position 24 and
   68 (reference 25). Neither a 3D-translate promotion, nor the scale on the wrapper itself (this assumption's own
   fallback), nor CSS `zoom` on the stage fixes it; only an unpromoted wrapper matches, which defeats the phase. Crawford
   compared the two side by side in Chrome and Firefox and judged it fine ("it looks fine", 2026-10-17), so the one-ancestor
   fit stands and the §7 Q1 blur fallback is **not** adopted. Untried if it is ever noticed: snapping each mover's `x`/`y`
   to the device-pixel grid, or promoting a mover only while it moves.
4. **`<use href="#world-robot-<id>">` keeps resolving across `<svg>` roots in the same document.** It already does:
   today's copy sits in the `robots` sheet and points into `robots-back`.
5. **A Zustand write commits to the DOM before the next frame paints.** Zustand renders through
   `useSyncExternalStore`, whose updates React flushes synchronously (in the same task, before yielding to paint). So a
   row switch's `layer` write and the dissolve copy's creation or removal, done in one task, never show a frame with
   the robot behind the midground and no copy in front of it (§1.5).
6. **The `Paint` trace event's `clip` quad is the rectangle repainted**, so summing it over a window and dividing by
   `BeginMainThreadFrame` events is "redrawn area per frame". The harness already reads the quad for its per-node
   attribution. The metric is proved before it is trusted (§1.11): on `main` the stock window reads about four
   viewport areas per frame and the `detach-bubbles+robots` ablation about none.
   **Doubt raised 2026-10-17 (Task 2 spike):** in Chrome 155 a `Paint` event's `clip` is the cull rect, not the repainted
   area: with one small mover repainting, the events were a `#document` paint with a clip of the whole page and a
   `DIV#mover` paint with an unbounded clip (-8388608 to 8388607), and `LayerTree.layerPainted` never fired. Task 3
   therefore has to prove the metric on `main` as written, and if stock does not read near four screens, replace the
   signal (for instance the raster work) before taking the baseline.
7. **`.ocean-scene` is never narrower than 16:9.** `OceanScene.css` gives it `height: 100%`, `min-width: 100%` and
   `aspect-ratio: 16 / 9`, so it is exactly 16:9 (portrait phones, where the scroller pans it) or wider. The fit
   (§1.1) therefore needs one formula: scale by whichever of width or height is the larger ratio, centre
   horizontally, pin to the bottom — which is what `xMidYMax slice` does today.
8. **Station fragments move to static sheets** (§1.8): L4 into the end of `back`, the front fragment into the start of
   `front` (under tint D), and L3 into one new static sheet between the bubbles and the front robots. Only the
   station ripple (1 s per arc) ever animates a fragment, and it then repaints the `front` sheet for that second. Not
   interviewed; predicted from the intent, and an open question (§7 Q2).
9. **`Robot.layer` stays the state** (JSON, carried by session replay, read by `FollowedRobotMarker` for its size and by
   the work loop for `rowOfRobot`). The mover's stacking slot derives from it in render; nothing writes the slot
   directly.
10. **One robot list in `OceanScene`.** The front/back id lists exist only to mount a robot in the right sheet; with the
    slot on the mover, one `useShallow` list of ids serves both rows and the scene re-renders only when the roster
    changes, never on a row switch.
11. **The swim tilt now pivots on the gem canvas centre** (`transformOrigin: '50% 50%'` of a wrapper the size of the
    canvas), not on the `.robot` group's bounding-box centre. The two differ by the halo's and orbiters' overhang,
    at most a few units; accepted as part of pre-v1.
12. **A hidden or scaled body is the whole mover.** `hideAtStation`'s `autoAlpha: 0`, the station arc's `scale` and
    `autoAlpha`, the job's bob on the body and `settle`'s position read all target what `getRef('robot-<id>')`
    returns, which is now the wrapper. A `visibility: hidden` wrapper paints nothing and takes no clicks.
13. **The dissolve copy rides the robot through a `gsap.ticker` listener** that lives exactly as long as the copy and
    mirrors the body's live `x`, `y` and `rotation` onto the copy's wrapper (three `gsap.quickSetter`s). It never touches
    audio, and it is the camera's and the marker's own pattern. *Amended 2026-10-17:* this assumption first named the
    dissolve timeline's `onUpdate`, which froze the copy: a back → front copy stays opaque until the swim arrives,
    seconds after the one-second fade (and so the timeline) has completed, and a finished timeline updates nothing.
    The robot swam on and its copy stood still, found live on a station exit. A ticker listener also runs after every
    timeline has updated, so it never reads a body one frame stale.
14. **The marker's wrapper is sized to the square and its caption band**, origin-centred, with `overflow: visible` for
    a long "name | job"; the glow is clipped inside the square already.
15. **No new tunable constants.** `WORLD_BOUNDS` (1920 × 1080) is the stage; the bubble strip and the marker box are
    derived from values that exist (`MIN_RISE_PX`/`MAX_RISE_PX`, `POP_SCALE`, the stream's own wobble and radius,
    `MARKER_SIDE`, `CAPTION_GAP`, `CAPTION_FONT_SIZE`). The only new named values are the slot order (`SCENE_SLOTS`) and
    the harness's metric.
16. **Reduced motion is untouched.** Every reduced-motion branch (no bob, no flights, the arcs as fades, no bubble
    timelines) is reached the same way; the sheets and movers exist in both modes.

## 1. Overview & Claude Explanation

Today the scene is seven stage-sized `<svg>` sheets. Chrome composites a whole `<svg>` root and never a `<g>` inside
it, so the four sheets that carry movement (`robots-back`, `bubbles`, `robots`, `marker`) are each repainted in full —
every pixel of the viewport — whenever anything on them moves, which is every frame. After this phase the scene is one
scaled stage holding four static sheets and one small mover per thing that moves: each robot, each building's bubble
stream, the camera marker, and a dissolve copy while a row switch runs. A swim slides a mover; only a change inside a
mover (orbiters flying, a burst rising) repaints, and it repaints a patch. Nothing a viewer sees changes.

### 1.1 The stage (`OceanScene.tsx`, `OceanScene.css`, `sceneFit.ts`)

- `.ocean-scene` keeps its box (`position: relative; height: 100%; min-width: 100%; aspect-ratio: 16 / 9`); the
  scroller still pans it on portrait phones. Inside it, one `div.ocean-scene__stage`: `position: absolute; left: 0;
  top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; transform: translate(var(--stage-x), var(--stage-y))
  scale(var(--stage-scale))`. Every sheet and every mover is a child of the stage and is positioned in scene units.
- `sceneFit(box, stage = WORLD_BOUNDS)` (new, pure, `sceneFit.ts`) returns `{ scale, x, y }` with
  `scale = max(box.width / stage.width, box.height / stage.height)`, `x = (box.width − stage.width × scale) / 2`,
  `y = box.height − stage.height × scale`. That is `xMidYMax slice` as arithmetic: a box wider than 16:9 is scaled to
  its width and loses the top of the world, never the ground.
- `useStageFit(sceneRef)` (new hook, same file family) observes `.ocean-scene` with a `ResizeObserver` and writes the
  three custom properties on it — one write per resize, never per frame. A zero-sized box (jsdom, a display: none
  ancestor) writes nothing; the CSS defaults are `--stage-scale: 1; --stage-x: 0; --stage-y: 0`.
- The deck camera's `targetFor` is unchanged: `scroller.scrollWidth / WORLD_BOUNDS.width` is the same scale the stage
  now wears.

### 1.2 The sheets and the slot order (`sceneStack.ts`)

The stacking order is one table, back to front, each entry a `data-scene-slot` value with its `z-index` in
`OceanScene.css`:

| Slot | What | Kind |
|---|---|---|
| `back` | water column, light shafts, the ridge, background buildings and pipe bridges, tint A, **the stations' L4 plates** | static sheet |
| `robots-back` | every robot whose `layer` is `'background'` | movers |
| `mid` | tint B, midground buildings and pipe bridges, tint C, the ground line | static sheet |
| `bubbles` | every building's and vent's bubble stream | movers |
| `stations` | the stations' L3 fragments | static sheet (new) |
| `robots` | every other robot | movers |
| `dissolve` | the layer-switch copies (§1.5) | an empty positioned `div`, filled by the work loop |
| `front` | **the stations' front fragments (halo and ripple)**, tint D, foreground buildings and pipe bridges | static sheet |
| `marker` | the Deck camera's followed-robot marker | mover |

`SCENE_SLOTS` is the ordered tuple; `slotForLayer(layer)` maps `Robot.layer` to `'robots-back'` or `'robots'`. The
four static sheets are `<svg class="ocean-scene__sheet" data-scene-slot=… viewBox="0 0 1920 1080">` filling the stage
(`position: absolute; inset: 0`); the box equals the viewBox, so no `preserveAspectRatio` is needed and the attribute
goes. The `SceneLayer` component becomes `Sheet`. The four moving sheets, `.ocean-scene__layer--moving`,
`#robot-layer`, `#robot-back-layer` and the front/back id lists are removed. The station layer ids (`#station-l4-layer`,
`#station-l3-layer`, `#station-front-layer`) stay on the groups, where they are now.

### 1.3 A mover

```html
<div class="mover mover--robot" data-scene-slot="robots">        <!-- position: absolute; left/top 0; will-change: transform -->
  <svg class="mover__svg" width="W" height="H" viewBox="0 0 W H" overflow="visible">
    …the drawing, in its own canvas units…
  </svg>
</div>
```

`.mover { position: absolute; left: 0; top: 0; will-change: transform; pointer-events: none }`. GSAP positions it in
scene units (`x`, `y` on the wrapper are a CSS translate in the stage's space, which the stage's scale turns into
pixels). The dimming rule moves with it: `.world-view[data-dimmed] .ocean-scene__sheet` keeps the brightness-and-blur,
`.world-view[data-dimmed] .mover` the brightness alone (`WorldView.css`).

### 1.4 The robot (`Robot.tsx`)

- `Robot` returns `<div class="mover mover--robot" data-robot-id data-scene-slot={slotForLayer(robot.layer)}>` holding
  `<svg class="mover__svg" width={gemWidth(gem)} height={GEM_CANVAS_H} viewBox="0 0 W H" overflow="visible">` holding
  the unchanged `<g id="world-robot-<id>" class="robot …" onClick style={--halo}>` → `<g class="robot__row">` →
  `<RobotBody motion="world">`. The `ref`, `setRef('robot-<id>', el)`, the mount `gsap.set({ x, y, transformOrigin })`
  and `onRobotMounted` all move to the wrapper. `.robot` carries no transform any more; `.robot__row` keeps
  `BACK_LAYER_SCALE` about the canvas centre (`rowOrigin`, in the svg's own user space, unchanged).
- `getRef('robot-<id>')` returns the wrapper. The ref registry's element type widens to
  `type RefElement = SVGElement | HTMLElement` (`refs.ts`); `createSwimTimeline`, `buildJobTimeline`'s `robotEl`,
  `deckCamera.targetFor`, `FollowedRobotMarker` and the work loop's `bodyOf`/`rowGroupOf`/`place`/`settle` need no
  change beyond the type — they write `x`/`y`/`rotation`/`scale`/`autoAlpha` and read `gsap.getProperty`, and the
  values are scene units as before.
- The swim's `x`/`y`/`rotation` and the job's bob are composite-only now; the row-scale ease (1 s per switch), the
  orbiters' hops and flights, the halo waves, the gem lights and the job decorations repaint the robot's own patch.
- Clicks: `.robot { pointer-events: auto }` as today; the wrapper, its svg, the stage and the sheets take none. The
  `OceanScene.clicks` test's "nothing outside a robot takes pointer events" extends to the stage and the movers.

### 1.5 The row switch and the dissolve (`workLoop.ts`)

- **No re-mount.** `moveToRow(loop, robot, layer, then)` writes `layer` and calls `then()` at once, body or no body.
  `Robot`'s re-render changes `data-scene-slot` (assumption 5). `markLayerSwitching`, `isLayerSwitching`,
  `clearLayerSwitching` and the `layerSwitching` set leave `robotMotionRegistry.ts`; `LoopRun.remounts` and every line
  that touched it (`killLegs`, `dropLeg`, `stopWorkLoop`, `onRobotMounted`) go; `useOrbiterMotion`'s
  `isLayerSwitching` branch (world mount with the orbiters docked at once) goes — a mount is always a real mount again.
  `findLayerSwitchPoint`, `legTo`'s split leg, `intoBackRow`, `intoFrontRow` and `easeRowWith` keep their logic.
- **Front → back** (`intoBackRow`): at the switch point, write `layer: 'background'`, start the `'out'` dissolve, swim
  on easing the row to `BACK_LAYER_SCALE`. **Back → front** (`intoFrontRow`): start the `'in'` dissolve and the swim
  easing to 1; when both have settled, write `layer: 'foreground'` and remove the copy in the same task.
- **The copy.** `dissolve()` appends to the `dissolve` slot's div (`getRef('robot-dissolve-layer')`, the key kept, now an
  `HTMLDivElement`) a `div.mover.mover--dissolve[data-dissolve-copy=<id>]` holding
  `<svg width=W height=H viewBox overflow="visible"><use href="#world-robot-<id>"/></svg>`, placed at the body's
  current `x`/`y`/`rotation`. Its timeline, keyed `dissolve-<id>`, tweens the wrapper's `opacity` (`'out'` 1 → 0 then
  removes it; `'in'` 0 → 1 and stays until the slot write) over `LAYER_DISSOLVE_SECONDS`, linear; a ticker listener
  mirrors the body's live `x`, `y` and `rotation` for as long as the copy exists (assumption 13). The front copy fades and the back robot stays
  opaque, both directions, as the J4 gate chose. `removeCopy`, `endDissolve` and `stopWorkLoop`'s sweep select
  `.mover--dissolve[data-dissolve-copy]` instead of `use[data-dissolve-copy]`.
- **Station exit.** `exitStation` writes `layer: 'background'` for a robot not already there and plays the arc on the
  same body at once; "its arc waits for the re-mount" is gone.

### 1.6 Bubbles (`BubbleStream.tsx`, `BubbleLayer.tsx`)

- `BubbleStream` returns `<div class="mover mover--bubbles" data-scene-slot="bubbles" style={{ left, top }}>` (the one
  inline style the template allows: a computed position) holding `<svg width=W height=H viewBox="0 0 W H">` and its
  circles at local `(W / 2, H − margin)`. The strip is sized once from the stream's own seeded parameters, which move
  from the `useGSAP` body into the `config` memo so render can read them: `margin = radius × POP_SCALE`,
  `W = 2 × (maxWobbleAmp + margin)`, `H = maxRisePx + 2 × margin`; `left = ventX − W / 2`, `top = ventY + margin − H`.
  `depthScale` shrinks all of it with the bubbles. The timelines, the rewind-to-vent `set`, `isActive`'s `pause(0)`
  and reduced motion are unchanged.
- `BubbleLayer` returns a fragment of streams (it is no longer inside an `<svg>`); `OceanScene` renders it as a stage
  child. `factoryBubbleProps.ts` is untouched.
- Per stream or nothing: no two streams share a sheet. The compositor-layer readout (§1.11) reports the strips'
  count and estimated memory; §7 Q3 holds the fallback if that memory beats the one full-screen sheet it replaces.

### 1.7 The marker (`FollowedRobotMarker.tsx`)

`Marker` returns `<div class="mover mover--marker" data-scene-slot="marker" data-followed-robot>` holding
`<svg width=W height=H viewBox="−W/2 −H/2 W H" overflow="visible">` and the unchanged origin-centred drawing
(`W = MARKER_SIDE`, `H = MARKER_SIDE + CAPTION_GAP + CAPTION_FONT_SIZE × 1.2`, the back-row square scaled as today).
`place()` sets the wrapper's `x`/`y` to the robot's canvas centre and toggles its `visibility`; the `gsap.ticker`
handler, its add/remove rules and the `useSyncExternalStore` read of the camera are unchanged. The look, the caption and
the content-layer string are unchanged (intent).

### 1.8 Stations (`OceanScene.tsx` only)

`ChargingStation.tsx` is untouched. `OceanScene` renders each station's `l4` fragment at the end of the `back` sheet
(after tint A), its `l3` fragment in the new `stations` sheet, and its `front` fragment at the start of the `front`
sheet (before tint D). The z-order is today's exactly: L4 · back robots · midground · bubbles · L3 · front robots ·
copies · front fragment · tint D · foreground. `stationRipple.ts` finds the front fragment through
`station-front-<id>` as before.

### 1.9 What is removed

The four moving sheets and `.ocean-scene__layer--moving`; `SceneLayer`'s `moving` prop and `preserveAspectRatio`;
`#robot-layer`, `#robot-back-layer` and the `#robot-dissolve-layer` `<g>`; `frontRobotIds`/`backRobotIds`;
`markLayerSwitching`/`isLayerSwitching`/`clearLayerSwitching`; `LoopRun.remounts`; `useOrbiterMotion`'s
layer-switching branch; the `<use>`-inside-a-sheet dissolve; the `robots-back`/`robots`/`bubbles`/`marker`
`data-scene-layer` names (every stage child wears `data-scene-slot`).

### 1.10 What does not change

`Robot.layer`; `BACK_LAYER_SCALE`, `LAYER_DISSOLVE_SECONDS`, `LAYER_SWITCH_STEP`, `BACK_HOSTS_ENABLED`; the depth tints
and their coverage; `layerSwitch.ts`; `createSwimTimeline`'s signature and keys; `buildJobTimeline` and the job
decorations; `robotMotionRegistry`'s arc-decorator and orbiter-work maps; `deckCamera.ts`; `stationRipple.ts`;
`ChargingStation.tsx`; `factoryBubbleProps.ts`; the lighting tick on the static sheets; every timeline key in
ANIMATION_SYSTEM.md's table; the audio path; the content layer (no new strings).

### 1.11 The harness (`scripts/perf/idle-paint.mjs`)

- **New column `redrawn px²/frame`** on every ablation row and in the `console.table`: the sum of each `Paint` event's
  clip-quad area in the window, in device pixels (× DPR²), divided by the window's `BeginMainThreadFrame` count. Beside
  it, `screens/frame`: the same over the emulated viewport's device-pixel area, the headline figure (about 4 on
  `main`, well under 0.25 after).
- **Proving the metric** (the perf-hygiene rule: reintroduce the bug the metric should detect) is part of the task
  that adds it: on `main`, stock reads ≈ 4 screens/frame and `detach-bubbles+robots` ≈ 0; on this branch, stock reads
  the robots' patches and `detach-bubbles+robots` ≈ 0 again.
- **Selectors follow the markup**: `ROBOT_GROUPS` = `.mover--robot .robot`, the `no-robots` ablation hides
  `.mover--robot`, `BUBBLES` = `.mover--bubbles circle`, `SCENE_LAYERS` becomes the slot list and the per-slot element
  count reads `[data-scene-slot="…"]`. The station ids are unchanged.
- **The compositor-layer readout** names a layer by `data-scene-slot` (sheets and movers alike), and prints movers'
  count and estimated memory separately from the sheets'.

## 2. Target File Structure

```text
src/
├── components/panels/screen/worldView/
│   ├── OceanScene.tsx                 CHANGED — the stage, four static sheets + stations sheet, one robot list, the dissolve div
│   ├── OceanScene.css                 CHANGED — .ocean-scene__stage, .ocean-scene__sheet, .mover, slot z-indexes
│   ├── OceanScene.test.tsx            CHANGED — scene-layer cases rewritten for the stage and slots
│   ├── OceanScene.css.test.ts         CHANGED — stage, slots, movers, pointer events
│   ├── OceanScene.clicks.test.tsx     CHANGED — selectors; stage and movers take no clicks
│   ├── sceneFit.ts                    NEW — pure xMidYMax-slice arithmetic
│   ├── sceneFit.test.ts               NEW
│   ├── useStageFit.ts                 NEW — ResizeObserver → --stage-scale/-x/-y
│   ├── useStageFit.test.ts            NEW
│   ├── sceneStack.ts                  NEW — SCENE_SLOTS, slotForLayer
│   ├── sceneStack.test.ts             NEW
│   ├── FollowedRobotMarker.tsx        CHANGED — its own mover
│   ├── FollowedRobotMarker.test.tsx   CHANGED
│   └── WorldView.css                  CHANGED — [data-dimmed] rules for sheets and movers
├── components/robot/
│   ├── Robot.tsx                      CHANGED — mover wrapper, ref on the wrapper, slot from layer
│   ├── Robot.test.tsx                 CHANGED
│   ├── gem/useOrbiterMotion.ts        CHANGED — layer-switching branch removed
│   └── gem/useOrbiterMotion.test.tsx  CHANGED — its three cases removed
├── components/actors/
│   ├── BubbleStream.tsx               CHANGED — its own strip mover; params into the config memo
│   ├── BubbleStream.test.tsx          CHANGED
│   ├── BubbleLayer.tsx                CHANGED — a fragment of movers
│   └── BubbleLayer.test.tsx           CHANGED
├── animation/
│   ├── robotMotionRegistry.ts         CHANGED — layerSwitching set and its three exports removed
│   ├── robotMotionRegistry.test.ts    CHANGED
│   ├── swimAnimation.ts               TYPE ONLY — RefElement
│   ├── deckCamera.ts                  TYPE ONLY
│   └── jobMoves/buildJobTimeline.ts   TYPE ONLY — robotEl: RefElement
├── systems/
│   ├── workLoop.ts                    CHANGED — moveToRow, dissolve(), remounts gone, copy selectors
│   ├── workLoop.test.ts               CHANGED — the re-mount cases replaced by slot-write cases
│   └── workLoop.integration.test.ts   CHANGED — fixtures mount a mover, not a bare <g>
├── utils/
│   ├── refs.ts                        CHANGED — RefElement
│   └── refs.test.ts                   CHANGED
└── docs/
    ├── robotJobsJ4Docs.test.ts        CHANGED — the rows this phase removes; the stack case re-pinned to slots
    └── perMoverLayersDocs.test.ts     NEW — doc/code name guard for this phase
scripts/perf/
└── idle-paint.mjs                     CHANGED — redrawn px²/frame, screens/frame, selectors, mover readout
docs/
├── ANIMATION_SYSTEM.md                "Scene layers" → "Scene stack" (stage, sheets, movers, slots); "Layer switch" rewritten;
│                                      "Ref registry" element type; the dissolve key row
├── ROBOT_DESIGN.md                    render contexts: the world body lives in a mover; the swim pivot
├── BUILDING_DESIGN.md                 stations: the three fragments' sheets
├── PERFORMANCE.md                     the new column, the baseline, the gate rows
├── todo/roadmap.md                    Phase 53
└── todo/backlog.md                    item 26 → shipped pointer
```

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. `ChargingStation.tsx`, `RobotBody.tsx`, `RobotGem.tsx`, `layerSwitch.ts`,
  `stationRipple.ts`, `factoryBubbleProps.ts`, every factory and scenery renderer, the stores and the audio path are
  read, not edited.
- **Scene units everywhere.** No module learns the stage scale except `sceneFit`/`useStageFit`. A reviewer finding
  `getBoundingClientRect`, `devicePixelRatio` or a scale factor in a robot, bubble, marker or work-loop file should
  reject it.
- **GSAP + `timelineMap` + `setRef`/`getRef` only.** No `requestAnimationFrame`, `setTimeout`, `setInterval` or
  `queueMicrotask` anywhere in this phase. The ResizeObserver callback is the one non-GSAP callback, and it writes
  CSS custom properties, never animates.
- **Strict Separation holds.** No timeline callback added here reads audio state or calls `AudioEngine`; the dissolve's
  ticker listener writes a transform and nothing else.
- **Visual Mapping holds.** The haze between rows stays the scene's (tints B and C in `mid`); no overlay is added to a
  robot. Day/night lightness and battery dimming remain the only two.
- **No cabinetry or styling on wrappers.** A mover is an invisible box: no border, background, shadow or filter of its
  own beyond the existing dimming rule.
- **State stays JSON.** No wrapper, element, observer or timeline enters Zustand; `Robot.layer` is the only state read.
- **Content layer.** No new display strings.
- **Dependencies:** none added.
- **Ask first:** sizing a mover box from anything but the element's own geometry; adding a `will-change` to a static
  sheet; changing any constant in §1.10.
- **Never:** put a mover back inside a stage-sized `<svg>` for z-order convenience; reintroduce the re-mount path or
  the layer-switching mark; make the dissolve a robot overlay; gate on any one machine's HUD.

## 4. Code Style & Architecture Conventions

```ts
// src/components/panels/screen/worldView/sceneFit.ts — pure; xMidYMax slice as arithmetic (spec §1.1)
export interface StageFit { scale: number; x: number; y: number }

export function sceneFit(box: { width: number; height: number }, stage = WORLD_BOUNDS): StageFit {
  const scale = Math.max(box.width / stage.width, box.height / stage.height);
  return { scale, x: (box.width - stage.width * scale) / 2, y: box.height - stage.height * scale };
}
```

```tsx
// src/components/robot/Robot.tsx — the mover (spec §1.4); the inner tree is today's, minus the transform
<div ref={ref} className="mover mover--robot" data-robot-id={robotId} data-scene-slot={slotForLayer(robot.layer)}>
  <svg className="mover__svg" width={w} height={GEM_CANVAS_H} viewBox={`0 0 ${w} ${GEM_CANVAS_H}`} overflow="visible">
    <g id={`world-robot-${robotId}`} className={className} onClick={handleClick} style={style}>
      <g className="robot__row">
        <RobotBody robot={robot} motion="world" />
      </g>
    </g>
  </svg>
</div>
```

```ts
// src/systems/workLoop.ts — a row switch is a write, not a wait (spec §1.5)
function moveToRow(loop: LoopRun, robot: Robot, layer: RobotLayer): void {
  write(loop, robot.id, { layer });
}

function intoFrontRow(loop: LoopRun, robot: Robot, destination: Vec2, onArrive: () => void): void {
  let waiting = 2;
  const settled = live(loop, () => {
    if (--waiting > 0) return;
    const here = robotOf(loop, robot.id);
    if (!here) return;
    moveToRow(loop, here, 'foreground');
    removeCopy(robot.id);
    onArrive();
  });
  dissolve(loop, robot, 'in', settled);
  swimTo(loop, robot, destination, 1, settled);
}
```

- Plain named function components and exports, explicit prop interfaces, co-located CSS; the one inline style is the
  bubble strip's computed `left`/`top` (the template's "dynamic attr values" allowance).
- Comments cite this spec's section the way `workLoop.ts` cites `ROBOT_JOBS_AND_STATIONS.md §1.10`.
- Tests that need a body mount a real mover (`div > svg > g.robot > g.robot__row`) through a shared fixture helper,
  the way `workLoop.test.ts`'s current fixture builds its `<svg><g>`; they never fake `getRef` with a bare `<g>`.
- Parity fixtures seed distinguishing values (the parity-fixture rule): two robots at different `x`, in different
  rows, so a slot or position assertion cannot pass by coincidence.

## 5. Testing & Verification Requirements

### 5.1 Unit (Vitest, colocated)

- `sceneFit.test.ts`: exactly 16:9 → scale from either side, `x = y = 0`; wider than 16:9 (2560 × 1080) → width-driven
  scale, `x = 0`, `y < 0` by the cropped height; taller than 16:9 is unreachable (assumption 7) but the function still
  returns the height-driven fit with `y = 0` and `x > 0`; a 0 × 0 box returns scale 0 (the hook, not the function,
  skips it).
- `useStageFit.test.ts`: a resize writes `--stage-scale`, `--stage-x`, `--stage-y` on the observed element (a mocked
  `ResizeObserver` fed one entry); a zero box writes nothing; unmount disconnects the observer; no GSAP, no timer.
- `sceneStack.test.ts`: `SCENE_SLOTS` is the nine slots in §1.2's order; `slotForLayer('background')` →
  `'robots-back'`, `slotForLayer(undefined)` and `'foreground'` → `'robots'`.
- `OceanScene.test.tsx`: the stage div exists inside `.ocean-scene` with the four static sheets and the `stations`
  sheet as `svg.ocean-scene__sheet[data-scene-slot]` children, in slot order, each with `viewBox="0 0 1920 1080"` and
  no `preserveAspectRatio`; every robot renders as a `.mover--robot` stage child whose slot follows its `layer`
  (one back-row and one front-row fixture); a row change re-renders the robot's slot without re-mounting it (the
  mount effect's `onRobotMounted` count stays 1); the dissolve div sits at the `dissolve` slot and is registered as
  `robot-dissolve-layer`; L4 is the last of `back`, L3 is in `stations`, the front fragment is before tint D in `front`;
  the depth-tint cases are unchanged; the re-render-cascade cases are unchanged.
- `OceanScene.css.test.ts`: the stage's transform reads the three custom properties and has origin `0 0`; every slot
  has a `z-index` and they increase in `SCENE_SLOTS` order; `.mover` is absolutely positioned with
  `will-change: transform` and `pointer-events: none`; `.ocean-scene__sheet` fills the stage and takes no pointer
  events; `.robot` takes them; no selector still names `ocean-scene__layer`.
- `OceanScene.clicks.test.tsx`: the existing four cases, with the stage, the sheets and the movers in the "nothing
  outside a robot takes pointer events" sweep; a click on a back-slot robot and on a front-slot robot each select.
- `Robot.test.tsx`: the existing click-routing, glow, halo and dissolve-id cases pass against the new tree (the id
  stays on `.robot`, the row wrapper is still its only child); new: the registered ref is the wrapper and the mount
  `gsap.set` targets it; the wrapper's slot follows `layer`; the inner svg's size is the gem canvas and it is
  `overflow="visible"`.
- `useOrbiterMotion.test.tsx`: the three "marked world mount" cases are deleted; a world mount always attaches
  (existing cases cover it).
- `robotMotionRegistry.test.ts`: the two layer-switching cases are deleted; `__reset` still clears both maps.
- `workLoop.test.ts`: the §1.5 cases replace the re-mount ones — front → back: the first swim ends at the switch
  point, `layer` is written there, a `.mover--dissolve` copy appears in the dissolve div at the body's position with
  opacity 1 and fades to 0 over `LAYER_DISSOLVE_SECONDS`, the robot stays opaque, the row eases to 0.75 over the
  second swim, the copy goes at the fade's end; the copy's `x`/`y`/`rotation` follow the body's on each update (seek
  the swim, seek the dissolve, compare); back → front: the copy starts at 0 and fades to 1, `layer` is written only
  after the swim and the fade have both settled, the copy goes in the same call; no body: `layer` flips and the leg
  continues at once; a recall mid-switch drops the copy; `stopWorkLoop` removes every `.mover--dissolve`; the station
  exit of a front-row robot writes the back row and plays the arc at once; `killLegs`/`dropLeg` no longer reference
  pending re-mounts (the "re-mount … adopts" cases become "a plain mount mid-dissolve ends the dissolve").
- `workLoop.integration.test.ts`: the fixture mounts a real `Robot` (a mover), and the decoration and job cases pass
  unchanged.
- `BubbleStream.test.tsx`: renders one `.mover--bubbles` with its svg sized from the seeded params (`W`, `H` as §1.6),
  positioned at `ventX − W / 2`, `ventY + margin − H`; circles sit at local `(W / 2, H − margin)`; the existing
  timeline, motion, `isActive` and reduced-motion cases pass; `depthScale` shrinks the strip.
- `BubbleLayer.test.tsx`: renders one stream per eligible actor, no wrapping svg.
- `FollowedRobotMarker.test.tsx`: the marker is a `.mover--marker` whose svg is origin-centred and
  `overflow="visible"`; `place` writes the wrapper's `x`/`y` and visibility; every existing "what it shows", "which
  robot", "where it sits" and "ticker" case passes against the wrapper.
- `refs.test.ts`: an `HTMLDivElement` and an `SVGGElement` both round-trip.
- `src/docs/perMoverLayersDocs.test.ts`: ANIMATION_SYSTEM.md's "Scene stack" table lists `SCENE_SLOTS` in order and
  marks the mover slots; its "Layer switch" section says a row switch is a slot write with no re-mount and names
  `dissolve`, `removeCopy`, `slotForLayer`, `sceneFit`, `useStageFit` (each checked against its source file); no doc
  still names `markLayerSwitching`, `isLayerSwitching`, `clearLayerSwitching`, `robot-back-layer`, `robot-layer`,
  `ocean-scene__layer--moving` or `remounts`; PERFORMANCE.md names the `redrawn px²/frame` column; the roadmap entry
  exists. Fails on a renamed export (mutation check).
- `src/docs/robotJobsJ4Docs.test.ts`: the identifier rows this phase removes are dropped; the scene-stack case reads
  slots (`data-scene-slot`) instead of `<SceneLayer name=…>`; the dissolve-key and `BACK_LAYER_SCALE` cases stay.

### 5.2 Gates (recorded in docs/PERFORMANCE.md)

1. **The metric, proved** (part of the harness task, before any product change): on `main`, stock ≈ 4 screens/frame
   and `detach-bubbles+robots` ≈ 0 at 1280 × 900, 1×. If stock does not read near 4, the `Paint` clip is not the
   repaint rect (assumption 6) and the task stops to report before the baseline is taken.
2. **Baseline**, `main` (with the camera no-op merged), production build, pinned `?session=` link, 1×, `--only none`,
   three rounds: `redrawn px²/frame`, `screens/frame`, busy, Paint, Compositor::Update, the layer readout.
3. **After**, this branch against that `main`, same session, order alternated, three rounds (the J-gate method).
   Pass: median `screens/frame` ≤ 0.25 × `main`'s (expected ≈ 0.05); median busy and Paint within `main`'s own spread;
   compositor-layer memory estimate ≤ `main`'s. Recorded, not gated: Compositor::Update (expected unchanged, the
   fix-3 finding), Layerize, the mover count.
4. **Pixel listen**, landscape, Full Audio Load, same link, `?debug`, three minutes on this branch and on `main`:
   playback underruns not above the run-to-run spread already recorded; the overlay's count is the record, not an
   impression (the Deck Camera Task 11 lesson).

A miss on 3 or 4 stops the phase for Crawford with the numbers; nothing is re-tuned to pass.

### 5.3 Manual (Crawford)

- A swim: the robot slides and tilts as before, in both rows, at the back row's 0.75.
- A job: orbiters fly to the roof and back, the decoration reaches the vent, pipe or outline, nothing is clipped at a
  box edge; a structural inspection on the widest building in view.
- A row switch each way: a one-second crossfade of the haze, no pop, the robot never visibly behind a midground
  building mid-fade.
- A station exit and entry: the bloom and the ripple as before; a Docked robot invisible and unclickable.
- Selection and company halos: the drop-shadow glow intact in both rows.
- Bubbles: behind the robots, under the foreground, the pop at the top of the rise intact.
- The marker on a phone: rides the followed robot, caption readable, square scaled for a back-row robot.
- Resize the desktop window across 16:9 and wider; a robot stays on its building through every size. Portrait phone:
  the scroller pans the stage and the camera's follow still lands on the robot.
- Open a content pane: the world dims, movers included; close it: back to bright.
- Reduced motion: unchanged behaviour throughout.
- The whole list once more in Firefox (and Safari if a device is to hand): the app is not Chrome-only, and the harness
  (§5.2) can only measure Chromium, so the other browsers are checked by eye.

## 6. Git & Workflow Context

- Branch `perf/per-mover-layers` off `main` after the camera no-op PR merges. One commit per task, RED first, the TDD
  workflow in memory (`tdd-incremental-workflow`): stop and report at gates, §5.2's four included.
- Commit messages: short imperative sentences, with the attribution line the session reminder gives.
- Docs land in the same branch: ANIMATION_SYSTEM.md's "Scene stack" and "Layer switch", the ref-registry element type,
  ROBOT_DESIGN.md's render contexts, BUILDING_DESIGN.md's station fragments, PERFORMANCE.md's column and gate rows,
  roadmap Phase 53 (shape of Phase 52's entry: links, status, About, Not Doing), backlog 26's pointer.
- Human operator handles branch creation, the PR and the merge.

## 7. Open Questions

- **Q1 If Chrome clips a mover's overflow (assumption 1 fails).** Fallback: size the wrapper's box to the robot's
  largest reach — the canvas plus `WAVE_TRAVEL` on every side for the halo, and during a job the job's own bounds
  (`stepPoint`/`stepPath` give every target) applied by `addWork` for the run and reset on complete. Recommendation:
  verify first; build the fallback only if needed.
- **Q2 Station front fragments in `front` (assumption 8).** The ripple repaints the foreground row for one second per
  arc. Alternative: one small static sheet per station (two or three), sized to its geometry and ripple. Recommendation:
  `front`, and revisit only if the gate's attribution shows ripples as a top painter.
- **Q3 Bubble strips always promoted.** Fifty-odd small layers; the estimate is a few hundred KB each at desktop scale,
  most of them transparent and cheap. Alternative: promote a strip only while its burst runs (a `will-change` toggle
  from the stream timeline's `call`). Recommendation: always; the layer-memory gate line decides. Crawford
  (2026-10-16): if the bubbles as they are turn out to be the problem, he is happy to rework them completely rather
  than keep the strips — so a miss on the bubbles' account stops for a redesign (one stream per district, fewer
  circles, a different effect), not for a workaround.
- **Q4 The camera no-op as a hard prerequisite.** Taking the baseline before it merges is valid A/B too (both sides
  carry the marker). Recommendation: merge it first, so the baseline is the world this phase ships into.
- **Q5 Roadmap number 53.** 51 (Guide) and 52 (Job Decorations) are the last entries; nothing else has claimed 53.
- **Q6 The swim pivot (assumption 11).** Accept the canvas-centre pivot, or set `transformOrigin` from the `.robot`
  group's `getBBox()` once at mount to keep today's exact pivot. Recommendation: accept; the difference is a few units
  on a five-degree tilt.
