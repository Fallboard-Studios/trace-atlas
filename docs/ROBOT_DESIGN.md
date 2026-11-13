# Robot Visual Design Guide

## Overview

A robot is a seeded stack of low-poly **gem polygons** (Roadmap Phase 39, spec
[GEM_POLYGON_ROBOTS.md](specs/GEM_POLYGON_ROBOTS.md), sketch
[gem-polygon-robots.html](sketches/gem-polygon-robots.html)), with four orbiters docked to its hull
(Roadmap Phase 40, spec [ORBITING_POLYGONS.md](specs/ORBITING_POLYGONS.md)). Its body is **identity
and seed, not audio**: the geometry comes from `Robot.gemSeed`, the colour from
`Robot.identityColor`. Audio reaches the backing, Mids and Top only through three continuous dials —
the two lights, each Mid polygon's lit level, and the body scale — so an audio edit can brighten, dim
or resize a robot but never change a count, a side, a line or a position there. The orbiters are the
one exception: composition settings (not audio) drive how many are attached and their size/line/strip
("Orbiters" below), and an attach/detach always animates — never a pop. Day/night lightness and
battery dimming are the first two overlays, on the body. The note cloud is the third, drawn around the
body and never on it: the robot's own notes, fed only by the engine's note events ("The note cloud"
below).

The geometry is never stored: `Robot.gemSeed` is the only persisted value, and
`getRobotGem(gemSeed)` derives the parts on demand, cached per seed for the life of the page
(runtime-only, like `timelineMap` — never in Zustand, never in a session).

**Related references:**
- [Audio System Guide](AUDIO_SYSTEM.md) — AudioEngine, layered voices
- [Animation System Guide](ANIMATION_SYSTEM.md) — GSAP timeline patterns for robot motion
- [Procedural Generation](PROCEDURAL_GENERATION.md) — `getSeededVal`, the `'robot.gem.seed'` dataId
- [Performance](PERFORMANCE.md) — "Gem Polygon Robots — the Task 9 idle-paint gate"
- [Orbiting Polygons spec](specs/ORBITING_POLYGONS.md) — the orbiter dock/attach/detach design (Phase 40)
- [Note Cloud spec](specs/ROBOT_NOTE_CLOUD.md) — the third overlay (backlog 79); its motion is in
  [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#the-note-cloud), its events in
  [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-events--audio-to-the-picture)

## The generator

`src/components/robot/gem/polygon.ts`, pure functions over a seeded stream (`alea`), ported from the
Gate 1 sketch. `generateRobotGem` lays out one robot on a canvas `GEM_CANVAS_H` (80) units tall and
80 × a seeded width factor (1, 1.25, 1.5, 1.75 or 2) wide:

| Part | Box | Rules | Lines | Lights | Z |
|---|---|---|---|---|---|
| Backing | 25k × 25, centred | `BASE_RULES`: convex, may be symmetric, no bevel, near-black | 0 | 0 | lowest |
| Mid left | 20–24k × 34–36, right edge on the centre line | `MAIN_RULES`: ≤ 2 concave, never symmetric | 2 | 0 | 2nd lowest |
| Mid right | 20–24k × 34–36, left edge on the centre line | `MAIN_RULES` | 2 | 0 | 3rd lowest |
| Orbiters ×4 | 24 × 16, docked at Top's four corners (Phase 40) — never stretched by the width factor | `ORBIT_RULES`: ≤ 4 concave corners, may be symmetric | 1 each | 0 | 2nd highest |
| Top | 32k × 32, centred | `MAIN_RULES` | 4 | 2 | highest |

(k = width factor.) Orbiters straddle Top's four corners — half tucked under it — by design: Phase
40 docks them to the hull, nestled between Mid and Top, rather than the Phase 39 layout that kept
them clear at the canvas corners for an orbit that no longer exists.

Every polygon has 8–12 sides, every edge at a multiple of 15°, at most 4 right angles, and touches
all four edges of its own box. `genPolygon` builds a chamfered rectangle — each corner left square,
cut once (`chamfer`), cut twice at complementary angles (`double`) or stepped with a slanted inner
wall (`step`, one concave corner) — with every cut capped at 45 % of its edge, then rejection-samples
until the rules hold **and** `bevelHolds`: the part's own bevel must not invert any edge (short edges
otherwise bow-tie under the inset).

Boundary lines (`genLine`) run from one inner edge to another as one 45° run plus one axis-aligned
run, at least 0.35 units clear of every facet edge (half the 0.8 stroke). Lights (`genLights`) sit
at two non-adjacent inner vertices, pulled 30 % toward the vertex mean. Each part retries its
outline until all its lines and lights fit, so the counts are guaranteed.

## Bevel and shading

Every part except the backing is a **bevel ring**: the outline, its inset by `bevelDepth(w, h)` =
min(2.5, 18 % of the short side), and one trapezoid facet per edge between them; the inset is the
flat face. `src/components/robot/gem/gemShading.ts`:

- **One light for every robot**, `GEM_LIGHT`, from the top-left. A facet's shade is its edge's
  outward normal · `GEM_LIGHT` (−1..1).
- `facetTone` moves the host colour's lightness by shade × `GEM_FACET_CONTRAST` (20).
- **`GEM_FACET_TONES` = 3**: shades are quantized to three levels (fully lit, neutral, fully
  shaded) before toning. This was a performance decision (the moving robot layer re-rasterizes
  every frame and its cost tracks paint operations); the extremes keep full contrast.
- `quantizeShade` is shared with world scenery (roadmap Phase 42 D2): `scenery/gemShape.tsx`
  imports it from `gemShading.ts` for its own three-tone gem accents, rather than re-deriving tone
  quantisation or reusing the robot generator (`getRobotGem`) — see BUILDING_DESIGN.md "Scenery
  families".
- **The world shares the material, not the light** (roadmap Phase 44, BUILDING_DESIGN.md "World Gem
  Material"): factories, mass scenery and terrain wear the same bevel ring, built from this module's
  pieces — `quantizeShade` for the three tones, `polygon.ts`'s `inset` and `edgeNormals` for the
  geometry, and `bevelDepth`'s one 18 % short-side cap (it takes a depth parameter, so the world's 8 px
  goes through the same cap instead of a second copy). The light is the exception: a robot keeps the
  fixed top-left `GEM_LIGHT`, while a world body is lit by `worldLightVector` — the hour's east/west
  sun — so a building takes the sun and a robot does not.

`RobotGem` draws each part's facets as one `<path>` per tone (`facetPaths` in `gemPaths.ts`), its
face as one polygon and its boundary lines as one path — about 40 drawn shapes per robot.

## Colour

`src/components/robot/gem/gemPalette.ts` — `gemPalette(gem, identityColor, daylight, midLit,
contrast)` resolves every colour `RobotGem` draws into a string; the renderer computes none.

| Part | Fill | Lines |
|---|---|---|
| Top, orbiters | `identityColor` | identity, lightness −26 |
| Mid | from near-neutral dark toward identity (lightness −16, saturation −18) by its lit level, keeping identity's hue | the matching dark→identity line tone |
| Backing | near-black, fixed | — |
| Lights | warm white, fixed (emissive) | — |

Facet fills are the face colour toned per quantized shade; the facet stroke is the fully shaded tone.

## What audio drives

Three continuous dials, all computed in `RobotBody`'s audio memo from `robotVisualHelpers.ts` — and
nothing else:

- **Lights** — `calculateLampIntensity(layers, detail)`: averaged audible layer gain blended with
  release (`bodyShapeFromAdsr(adsr).detail`), floored at `LAMP_MIN`; both lights equal.
- **Mid lit level** — `layerLitLevel(gain)`: Mid left ← Coaxial (`layers[1]`), Mid right ←
  Harmonic (`layers[2]`). Gain 0 or no layer → `MID_DARK_LEVEL`; otherwise `MID_LIT_MIN`..1 up to
  `MID_GAIN_MAX`. A gain drag slides the Mid's tone; nothing pops.
- **Body scale** — `calculateBodyScale(octaveRange, bodyShapeFromAdsr(adsr).scale)`: register step
  × attack bias, floored at `BODY_SCALE_MIN`; range 0.735–1.69, about the canvas centre.

Attack and Release are normalised over `ENVELOPE_TIME_MAX_SECONDS` (2 s): the same number as their sliders'
maximum and the top of their seeded range, so a seeded robot's attack and release spread over the whole 0..1 of
`scale` and `detail`. A value past it (an old save's) clamps.

Waveform, filter frequency, phase and detune have no visual mapping on gem robots (later branches
in [gem-polygon-robots.md](ideas/gem-polygon-robots.md) may map them to geometry or motion).

Pan (`Robot.pan` / `Robot.panAuto`, Roadmap Phase 49) reaches the body through no dial: the list above is
unchanged, and nothing under `src/components/robot/gem/` or in `RobotBody.tsx` reads either field. Switching Auto off stops only the audio panner following the robot; the
robot keeps swimming.

Robot Articulation (portamento, the attack and release shapes, and the bus filter's cutoff, resonance and type, plus
the cutoff's `bus.frequency` LFO link; roadmap 50.1) reaches the body through no dial either: the list above is
unchanged, and nothing under `src/components/robot/gem/` or in `RobotBody.tsx` reads `portamento`, `filterQ`,
`filterType`, `attackCurve`, `releaseCurve` or `bus.frequency`, and `bodyLineDials` still reads only the three layer
gain links. Attack and Release still feed the Lights and Body
scale as before, through `bodyShapeFromAdsr`.

The two sends (`Robot.reverbSend` / `Robot.delaySend`, the Reverb and Delay sliders; roadmap 50.2) reach the body
through no dial either, and a send swell moves a slider, never the gem: nothing under `src/components/robot/gem/` or in
`RobotBody.tsx` reads either field. A robot's depth in the echo is a
property of the audio graph only; its body is still identity and seed. The same holds for the three Robot Effect Sends
(`Robot.gritSend` / `Robot.shimmerSend` / `Robot.doubleSend`, the Grit, Shimmer and Double sliders; roadmap 50.7): they
reach the body through no dial.

Robot Performance (`Robot.dynamics` / `rests` / `accents`, the melody's `rest` / `mark` stamps and the global Humanize; roadmap
50.5) reaches the body through no dial either: nothing under `src/components/robot/gem/` or in `RobotBody.tsx` reads `dynamics`,
`rests`, `accents`, `.rest`, `.mark` or `humanize`. A note struck harder, cut
short or landing a few milliseconds late is a property of the performance only; the gem keeps its seeded geometry and the three
audio dials above.

## Orbiters

The four orbiter polygons are the one part of the body composition settings drive directly (Roadmap
Phase 40, spec [ORBITING_POLYGONS.md](specs/ORBITING_POLYGONS.md)) — not audio, and never a pop.
`src/components/robot/gem/orbiterDials.ts` maps four composition fields to four dials, clamped to
their `constants/index.ts` ranges:

| Dial | Source | Rule |
|---|---|---|
| Count (1–4) | `rhythmicDensity` | <25 → 1, ≤50 → 2, ≤75 → 3, 76+ → 4 (`ORBITER_COUNT_BREAKS`) |
| Size | `rhythmicMotifLength.value` (0–8) | 0.75× … 1.25× (`ORBITER_SIZE_MIN/MAX`), 0.5 s tween on edit |
| Boundary-line width | `noteVariance.value` (0–8) | 0.3 … 1.1 (today's fixed Mid/Top 0.8 sits inside) |
| Strip opacity | `pitchRepeat` (0–100) | 0.35 … 1.0 — a centre stroke in `palette.light`, never battery-dimmed |

**Dock, don't orbit.** Each robot has a seeded corner order (`orbiterPlan(gemSeed)`, a stream
independent of the geometry generator's own — `gem.fixture.json` is untouched). The first `count`
corners of that order are *attached*: docked at Top's own corner (the generator table above), rigid
with the body, no idle motion. On spawn — including a robot's own first mount — every initially
attached corner flies a short hop into place (`useOrbiterMotion.ts`'s `flyIn`: dropped, shrunk and
faded, then `back.out` into its dock). A count increase flies in the next corner in order; a count
decrease flies the last-attached corner back out in reverse (`flyOut`) and hides it. Both are
animated, never a pop; `prefers-reduced-motion` swaps the hop for a 0.3 s opacity fade. At most one
count-driven attach/detach runs at a time per robot, tracked by a per-corner busy set so it can
never retarget a corner still mid-flight.

**Jobs lock the orbiters** (Roadmap Phase 43). In the world context only, `useOrbiterMotion`
registers `{ lock, unlock }` with `registerOrbiterWork` (`robotMotionRegistry.ts`). A working
robot's job locks them: any hop in flight finishes, count changes stop moving corners, and the job
flies the shown orbiters out to the building, works and flies them back to their docks. On unlock
the orbiters catch up to the current count in one pass, so a density edit mid-job never interrupts
the work and never pops. The hook knows only that it can be locked. Count still decides how many
orbiters work; it doesn't change how long a job takes. Cards and the detail avatar never lock
and never animate a job. The loop and the job timeline are in [ROBOT_LIFECYCLE.md](ROBOT_LIFECYCLE.md)
and [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#job-timeline).

## Non-audio overlays

Both are read outside the audio memo, so the once-a-second daylight tick never recomputes it
(backlog item 22).

- **Day/night** — the active locale's local time gives a 0..1 daylight multiplier that scales the
  lightness of every palette colour except the lights. `ignoreDaylight` pins it to 1.
- **Battery** — `computeBatteryDimOpacity(batteryLevel)` (1 / 0.75 / 0.5 / 0.1) multiplies the
  lights' opacity, and `batteryFacetContrast` lowers facet contrast with it, floored at
  `GEM_BATTERY_CONTRAST_FLOOR` (0.25) so the bevel never vanishes.

## The note cloud — the third overlay

Backlog 79, spec [ROBOT_NOTE_CLOUD.md](specs/ROBOT_NOTE_CLOUD.md). Around a robot, its own melody crosses
a piano roll: a solid rounded bar for each note it plays, right to left, white while the note sounds.
It answers "which robot is playing what?" without touching the body. The Visual Mapping guardrail
(CLAUDE.md) names it: fed only by the engine's note events, audio flows to the picture and never back;
it never changes the body's geometry, colour or dials; a note enters and leaves without a pop.

- **What feeds it.** `noteEvents.ts` alone ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-events--audio-to-the-picture)):
  one event per note that will sound, emitted past every gate, so a muted, docked, standing-by or
  capped robot draws nothing because it plays nothing. The cloud reads no audio setting and writes
  nothing to `RobotGem`.
- **What a note becomes** (`src/components/robot/notes/noteCloudModel.ts`, `nextDrawnNote`). Its
  **row** is its pitch within the robot's own range so far, at least `NOTE_RANGE_MIN_SEMITONES` (12)
  tall; the range only grows, so a note keeps its row. The even pitch classes (C, D, E, F♯, G♯, A♯)
  cross **in front** of the body, the other six **behind**. In a run of identical notes (same pitch,
  same sounding length to the millisecond, no rest of more than `NOTE_REST_MIN_SECONDS` (0.05 s)
  between) the first, third, fifth… are drawn. One model per robot, shared by every cloud of it
  (`subscribeDrawnNotes`), forgotten when its world body unmounts (`clearNoteCloudModel`).
- **Its shape** (`noteRows.ts`). The roll is `NOTE_ROLL_SIZE` (2.5) times the box the robot's parts
  fill at its body scale, centred on the gem canvas centre (`rollBox`). A note crosses it in
  `NOTE_CROSSING_SECONDS` (5), so a bar's length is its sounding length at that speed (`noteLength`:
  at least its thickness, at most `NOTE_MAX_LENGTH_SHARE` (0.8) of the width). A bar is
  `NOTE_HEIGHT_SHARE` (1/14) of the roll's height, never under `NOTE_MIN_PX` (4) on screen
  (`noteThickness`). The rows run straight through the middle but for a faint wave, and fan apart past
  `NOTE_EDGE_START` (0.55) of the way to each edge, where a bar tilts to its row's slope
  (`noteRowGeometry`).
- **Its colour** (`noteColor`). The robot's company colour, or for a freelancer the complement of its
  identity hue at `NOTE_COMPLEMENT_S` / `NOTE_COMPLEMENT_L` (100 / 70). A note turns `NOTE_HOT_COLOR`
  (near-white) while it sounds and fades back after. "Now", where a note's leading end is as it leaves
  the speakers, is `NOTE_NOW` (0.225) of the width in from the right edge.
- **Its strength.** The layers' opacity is `NOTE_PEAK_STRENGTH` (0.75). One mask on each layer
  (`noteMask`) takes a note in from clear at the right, to full at "now", down to `--note-dim` once it
  has sounded, to clear at the left edge: the mask dims a layer as a whole, so overlapping bars never
  show a darker patch. `--note-dim` is `NOTE_DIM` (0.35), or 1 on the **singled-out** robot: under the
  pointer or followed by the Deck camera (`src/systems/robotAttention.ts`), selected, soloed or
  highlighted.
- **The battery bands.** A world cloud places notes only while the robot's battery is in one of
  `NOTE_BATTERY_BANDS` (10–28, 38–55, 65–73, 83–100 %), or while it is **woken**: pointed at or
  selected, until it is next in its station (`notesShown`, `noteBands.ts`). Leaving a band places no
  new note and lets the ones in flight finish crossing. The bands thin the cloud; they never dim the
  body (that is the battery overlay's job).
- **Never a pop.** Notes enter and leave through the mask. A body-scale or gem change fades both layers
  out over `NOTE_WAKE_SECONDS` (0.3 s), rebuilds the roll and fades back; a row switch scales the
  layers with the row. A colour edit colours only later notes.
- **Off.** Under `prefers-reduced-motion`, and with `?notes=off` (the cost A/B switch), no layer is
  rendered.

## Render contexts

- **World** — `Robot.tsx` returns a **mover** (roadmap Phase 53, `.mover--robot`): a `div`, a
  compositor layer of its own, holding an `<svg>` the size of the gem canvas (`overflow="visible"`,
  so the halo, the orbiters' flights and the job decorations draw outside the box) holding the root
  `<g>` (`.robot`). GSAP sets position and the swim tilt on the **mover**
  (`getRef('robot-<id>')` is the mover); React sets no transform on it and `.robot` carries none —
  robots stopped mirroring on direction change in Phase 40, so there is no `scaleX` flip any more.
  The swim tilts about the gem canvas centre, which is the mover's centre. `.robot` renders
  `RobotBody`, which composes `RobotGem` with the audio scale. `motion="world"` enables
  `useOrbiterMotion`. A robot changes rows by changing the mover's `data-scene-slot`, not by being
  re-mounted ([ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#layer-switch)). The mover is also the note
  cloud's box (`data-note-cloud`): one note layer before the svg (behind the body) and one after it
  (in front).
  - **The back row** (Roadmap Phase 43 J4). A robot working at a background building, or exiting a
    station, is drawn in the back robot row, behind the midground, at `BACK_LAYER_SCALE` (0.75).
    That scale is on `.robot__row`, a wrapper between the root `<g>` and `RobotBody`, about the
    gem canvas centre, so it multiplies the body scale (0.735–1.69 becomes 0.55–1.27) without
    touching any dial. It is depth, not audio: the work loop eases it over the swim into or out of
    the row, never a pop, and the scene's depth tints haze that row like the buildings around it.
    Neither is a robot overlay, so the overlays stay day/night, battery and the note cloud (whose
    layers the work loop scales with the row). The root `<g>` carries
    `id="world-robot-{id}"`, which the layer switch's dissolve copy points at
    ([ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#layer-switch)).
- **Detail avatar** — `RobotScreen.tsx`'s `AvatarGem` passes `motion="avatar"` (orbiters
  attach/detach here too) and `viewBox={gemMotionViewBox(gem)}` — the plain `gemViewBox` canvas, padded
  for an orbiter's dock position at its maximum size and its attach/detach flight; usually a small or
  zero pad, since the docks sit close to Top's own corners.
  - **The desk column** draws the note cloud: the svg sits in `.robot-screen__gem-box`
    (`data-note-cloud`) between a behind and a front frame, which a `ResizeObserver` places on the
    svg's fit (`--note-fit-x`, `--note-fit-y`, `--note-fit-scale`). It places every note (no battery
    bands: opening the robot's screen is turning to it) at `--note-dim` 1. The box does not clip: the
    cloud spills over the details under the gem and only the console pane's edge cuts it (Gate 3,
    2026-11-13), so the column does not scroll; `.robot-screen__avatar-details` does.
  - **The phone band** draws no cloud.
- **Roster tile (`RosterTile.tsx`) and the company screen's gem (`CompanyScreen.tsx`)** — no `motion`
  prop: orbiters render statically, the first
  `count` of the seeded order at `scale(size)`, no hook, no animation, no note cloud.
  `viewBox={gemViewBox(gem)}` (`0 0 W 80`), unchanged from Phase 39.
- Both avatar and card: `preserveAspectRatio="xMidYMid meet"` and `RobotBody ignoreDaylight
  ignoreScale` fit every robot to its tile at scale 1. Body scale shows in-world only.

## Data flow

```
spawnSystem: getSeededVal('robot.gem.seed') ──► Robot.gemSeed (persisted)
                                                   │
RobotBody ─ getRobotGem(gemSeed) [cache] ──► RobotGem geometry (runtime only)
        ├─ audio memo:       scale, lamp intensity, midLit   (audioAttributes, octaveRange)
        ├─ composition memo: orbiterDials(robot)             (density/motif/variance/pitchRepeat)
        ├─ orbiterPlan(gemSeed) [cache, :orbit stream]        — seeded cornerOrder, outside both memos
        ├─ outside:          daylight, battery dim, identityColor
        ├─ gemPalette(...) ──► RobotGem (draw-only)
        ├─ useOrbiterMotion(root, plan, dials, enabled) ──► GSAP attach/detach on RobotGem's orbiters
        └─ useNoteCloud(...) ──► bars on the note layers beside the svg, never on RobotGem
                 ▲
AudioEngine.triggerWithCap ──► noteEvents ──► noteCloudModel (subscribeDrawnNotes)
```

`gemSeed` is drawn once at spawn, never user-edited, never inherited on the copy path and never
diffed into a session — a reloaded world regenerates the same seed, hence the same robot.

## Forbidden patterns

- Storing generated geometry (a `RobotGem`) in Zustand, a session or a fixture — only `gemSeed`.
- Any audio edit changing the backing/Mids/Top's layout — count, sides, lines, lights or position —
  or swapping geometry. Orbiters are the one exception, and only through their dials: an attach or
  detach always plays the hop (or its reduced-motion fade), never a pop.
- Computing a colour inside `RobotGem`, or drawing one element per facet or line.
- Hand-placed, per-shape positions — everything is generated relative to the part's own polygon.
- A palette for the body that ignores `identityColor`, or a new non-audio visual input beyond
  identity, seed, daylight and battery without amending the Visual Mapping guardrail.
- A React-owned `transform`/`display`/`opacity` on an orbiter's outer group in an animated context
  (`motion="world"`/`"avatar"`) — `useOrbiterMotion`'s GSAP is the only writer there.
- `requestAnimationFrame` loops or timers for robot visuals; GSAP owns motion.
- A note cloud fed by anything but `noteEvents` (reading the engine, Tone or a robot's audio settings
  for its notes), or writing to the body: its geometry, its colour or a dial. Notes in Zustand, or a
  tween or timer per note (the belt's one pass does a note's whole life).
