# Intent: Per-Mover Compositor Layers

> **Status (2026-10-17, roadmap Phase 53):** built on `perf/per-mover-layers`, not merged (the PR is Crawford's). The
> Task 20 idle-paint gate **MISSED its headline criterion**: `screens/frame` 0.95 against `main`'s 3.10 is 0.31 × `main`,
> limit 0.25; busy, Paint and layer memory are within their limits, and the work this intent targeted fell by over 90 %,
> but a document-layer repaint of unknown cause keeps the total above the line (PERFORMANCE.md, "the Task 20 gate").
> The Pixel listen (Task 21) ran: Full Audio Load, over five minutes, about 12 underruns, no distortion, no clipping;
> no `main` count was taken, so the not-above-`main` criterion is open. Checkpoints B and C were never recorded as passed.

Confirmed 2026-10-16 via the interview-me skill (5 questions; every guess confirmed, with one
correction and one note). The correction: the target is any device, not Crawford's laptop. The
laptop is where the cost became audible (backlog item 26; the baseline in
[PERFORMANCE.md](../PERFORMANCE.md#desktop-full-screen-underruns-are-raster-bound-2026-10-16)),
and it is now an anecdote, not a gate. The note: the Deck camera's marker keeps its look and its
caption. Starts from [backlog item 26](../todo/archive/backlog-archive.md#26-desktop-paint-stage-sized-moving-layers-re-raster-every-frame)
and the scene stack in [ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md#scene-stack--the-stage-the-sheets-and-the-movers).

- **Outcome:** Every per-frame mover in the world view — each robot, each building's bubble
  stream, the camera marker — draws on its own small compositor layer, so a move slides a layer
  instead of repainting a screen-sized one. `OceanScene.tsx`'s four moving `SceneLayer`s
  (`robots-back`, `bubbles`, `robots`, `marker`) stop being where anything moves.
- **User:** Anyone on any device. The waste is the page's, and its cost scales with the pixels
  the device has.
- **Why now:** The diagnosis found the structural fault: Chrome composites a whole `<svg>` root
  and never a `<g>` inside it, so one robot's GSAP write repaints up to four stage-sized layers
  per frame — 2560 × 1440 each at full screen, a phone's whole screen on a phone.
- **Success:** Redrawn area per frame, a page-level number `npm run perf:idle` learns to report,
  drops from about four screens to a dozen gem-sized patches plus the two or three bubble strips
  mid-burst; the Pixel listen stays the real-device check.
- **Constraint:** GSAP keeps writing scene units; the 0.75 back-row scale, the 1 s haze dissolve,
  the marker's look, clicks and every `getRef('robot-…')` reader keep their meaning; a row switch
  becomes a stacking-order write, not a React re-mount.
- **Sequencing:** The Deck camera's idle no-op ships first as its own small test-first PR; this
  phase then opens with the harness number and its baseline, not with any one machine.
- **Out of scope:** Audio headroom (the Audio Load default, `?latency=playback`); anything
  machine-side (the RTX, Windows graphics settings); any change to what moves or to how robots,
  bubbles or the marker look; keeping the re-mount machinery for its own sake.

## The mechanism, in plain terms

The scene is a stack of transparent sheets. The browser keeps a finished picture of each sheet
and stacks them to show a frame, which is cheap. Repainting a sheet's picture is the expensive
part, and today each sheet is the size of the whole screen. When one robot moves two pixels the
browser repaints its entire sheet, every pixel; with robots, bubbles and the marker moving at
once that is up to four screen-sized repaints per frame. A quarter of the pixels halved the cost
on the laptop, which is the signature. Give each mover a sheet just its own size and a move
becomes a slide, which costs almost nothing, and a repaint — orbiters flying during a job, a
burst rising — is a patch, not a screen.

## Behavior

- **Each world-context robot** is its own positioned wrapper holding a small `<svg>` the size of
  its gem canvas, `overflow: visible` so the halo waves, the detached orbiters and the job
  decorations draw past its box. The wrapper sits inside one scene container that carries the
  `xMidYMax slice` fit as a single CSS scale and offset, recomputed on resize only. GSAP writes
  `x`, `y` and the swim tilt on the wrapper in scene units, exactly the values it writes today, so
  a swim is composite-only.
- **Every reader keeps working unchanged in meaning:** `createSwimTimeline`, `buildJobTimeline`
  and the work loop's `place` write the element `getRef('robot-<id>')` returns;
  `deckCamera.targetFor` and `FollowedRobotMarker` read `gsap.getProperty(el, 'x' | 'y')` from it
  and still get scene units. The ref registry's element type widens; nothing else about the
  registry changes.
- **The back row's scale** stays on `.robot__row` inside the small `<svg>`, `BACK_LAYER_SCALE`
  (0.75) about the gem canvas centre, eased over a swim as today — a small repaint per frame for
  the one second it eases.
- **A row switch is a stacking-order change on the robot's own wrapper** at the switch point:
  below the midground sheet for the back row, above the bubbles for the front. No re-mount, so
  `markLayerSwitching`, the run's `remounts` map, the `onRobotMounted` continuation and
  `useOrbiterMotion`'s skip-the-mount-hop case go. `findLayerSwitchPoint` and the split leg stay.
- **The dissolve keeps its look:** for `LAYER_DISSOLVE_SECONDS` a `<use href="#world-robot-<id>">`
  copy draws on a second small sheet at the front slot, riding the robot's position, and it is the
  copy that fades — 1 → 0 after a front → back switch, 0 → 1 before a back → front one — while the
  robot itself sits behind the midground. Keyed `dissolve-<id>` as today.
- **Each `BubbleStream` is its own small sheet:** a strip anchored at the vent, as wide as the
  wobble and as tall as the longest rise, sized once at mount; the bubble timelines are unchanged.
  Only the streams mid-burst repaint. Per stream or nothing: any shared sheet brings the
  screen-sized repaint back.
- **The marker** gets its own small sheet, unchanged in look and caption, riding the followed
  robot as it does now.
- **Clicks:** `.robot` takes pointer events, in either row; wrappers, the scene container and
  every sheet take none, so a wrapper's box never blocks what is under it. The Phase 43 Task 33
  clicks test keeps passing.
- **The static sheets** (`back`, `mid`, `front`) are untouched: they repaint once a second on the
  lighting tick, never per frame, as the ANIMATION_SYSTEM rule says.

## Style / constraint

- Scene units everywhere, never per-robot pixel maths. The fit lives in one place (the container),
  the way the shared `viewBox` and `preserveAspectRatio` are one place today.
- GSAP + `timelineMap` + `setRef`/`getRef` only; no `requestAnimationFrame` loop; the Strict
  Separation guardrail holds (nothing here touches `AudioEngine`).
- The haze between the rows stays the scene's (tints B and C in the `mid` sheet), never a robot
  overlay — the Visual Mapping guardrail allows only the day/night and battery overlays.
- No cabinetry or container styling on the wrappers; they are invisible positioning boxes.
- Pre-v1: nothing is kept because it is how it was. The re-mount goes; the crossfade the J4 gate
  chose stays because it is the visual, not the mechanism.

## The gate

1. **The harness first.** `npm run perf:idle` learns "redrawn area per frame": the pixel area the
   page asks to be repainted per frame, summed over the paint events (or the compositor layers)
   the trace already carries. It is a property of the page, read the same on any machine.
2. **Baseline** on main with the camera no-op merged: expected about four screen areas per frame.
3. **After:** about twelve gem-canvas patches, plus the bubble strips mid-burst and whatever the
   job decorations reach. Busy and Paint within the usual band. The renderer's
   `PaintArtifactCompositor::Update` is **not** expected to drop (the 2026-10-02 fix 3 result,
   PERFORMANCE.md "Idle paint & composite") and is not part of the gate.
4. **The Pixel listen** as the device check, as every phase: `?debug`, Full Audio Load, a few
   minutes, underruns read.

## Out of scope

- Candidate 3 of backlog 26: changing the desktop default Audio Load or latency as headroom.
- Machine-side mitigations: forcing Chrome onto the RTX, Windows or Lenovo graphics settings.
- Reducing what moves: the fleet, its idle motion, the bubble rate, the marker.
- Any change to how a robot, a bubble or the marker looks.
- Keeping the React re-mount path, or the `<use>`-in-`#robot-dissolve-layer` mechanism, for
  compatibility.
- Measuring on Crawford's laptop as a gate. A listen there is welcome as an anecdote.

## Decisions easy to get wrong later

- **Fix 3 (2026-10-02) is not evidence against this.** It made each robot an HTML-positioned
  composited div and measured neutral — on the renderer main thread's Paint and
  Compositor::Update, at 1280 × 900, in headless Chrome. GPU-process raster, the 94 % here, was
  never measured. Expect the main-thread compositor cost to stay; the raster area is what falls.
- **Never put a mover back inside a stage-sized `<svg>`** for z-order convenience. Z-order is the
  wrapper's stacking slot; the sheets are not containers for movers.
- **The camera no-op is a separate PR**, not a task of this phase, and it also stops the marker
  appearing on viewports with no scroll range, which is where its sheet was a live screen-sized
  repaint for nothing.

## Known implementation note (not yet spec'd)

- Whether all seven sheets and every wrapper are siblings inside the one fitted container (a row
  switch is then a `z-index` write), or the container is split around the midground sheet. The
  former is the lean; the spec decides.
- Whether `Robot.layer` stays the serialisable state the stacking slot derives from in render (a
  re-render, not a re-mount, so the work loop's continuation runs at once), or the loop writes
  the slot directly. `FollowedRobotMarker` reads `layer` for its size and session replay carries
  it, so the field most likely stays.
- The charging-station fragments (`l4`, `l3`, `front`) leave the moving sheets for static ones at
  their z slots; only the 1 s ripple ever animates one. Not interviewed; predicted.
- `scripts/perf/idle-paint.mjs` keys its ablations on `#robot-layer .robot`, the `bubbles`
  `data-scene-layer` and the station layer ids; those selectors move with the markup, and the
  `SCENE_LAYERS` list changes shape.
- `WorldView.css`'s `[data-dimmed]` brightness rule for the moving layers applies to the wrappers.
- The exact definition of "redrawn area per frame" in the harness, and the roadmap phase number
  for the spec.
