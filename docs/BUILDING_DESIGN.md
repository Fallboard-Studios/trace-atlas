# Factory Visual Design Guide (Silhouette System)

## Overview

Factories are opaque rectangular silhouettes placed along the ocean floor.
Their size, placement, and depth row give the scene a sense of parallax and
scale. Every factory shares the same rectangular base shape; skyline variety
comes from **rooftop greebles** (machinery, antennae, spires, etc.) while
facade variety comes from window styles and belt courses. Additional visual
variation comes from a deterministic pseudorandom process seeded by the
actor ID and horizontal position. `Alea` + `simplex-noise` produce a noise
value which drives variant choice, sizing, and per-instance colour shifts.
The actor ID itself is generated deterministically from the locale's noise
map (`generateFactoryId()`, `factoryPlacementSystem.ts`), the same
`crypto.randomUUID()`-replacing pattern `generateRobotId()`/`generateCompanyId()`
use — required for "Reloading the scene produces identical buildings" (below)
to actually hold, per [PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md).

A factory's colour shift additionally layers a second, independent seed on
top: the active Attenuation Style's own noise map (`deriveAsColorShift()`,
`factoryPlacementSystem.ts`) contributes an additive hue/saturation delta
summed with the locale-seeded shift above. Nothing else about a factory is
affected — placement, count, id, variant, scale, and greeble selection stay
driven exclusively by the locale seed regardless of which Attenuation Style
is active. Retransmitting a new Attenuation Style recolors an existing
locale's factories in place (`recolorActorsForAttenuationStyle()` — roadmap
Phase 42 D2 generalised it to cover every body-bearing scenery actor too,
see "Scenery families" below) without touching any of those other fields. See
[docs/specs/ATTENUATION_STYLE.md](specs/ATTENUATION_STYLE.md) §1.2.

A third additive step, the **accent lean** (roadmap Phase 35,
[docs/specs/WORLD_PALETTE_PULL.md](specs/WORLD_PALETTE_PULL.md)), pulls the
resulting body colour partway toward one of two console accent hues the
Attenuation Style picks for itself, and lifts its saturation — see "Accent
Lean" under Color System below. It is folded into the same two stored
numbers at the same two write sites, so nothing downstream knows it exists.

**Key source files:**

| File | Purpose |
|------|---------|
| `src/components/actors/Factory.tsx` | Renders the silhouette + greebles for a given actor |
| `src/components/actors/BubbleLayer.tsx` | Every building's `BubbleStream`, in the scene's own bubble layer (roadmap 17.2.5) |
| `src/components/actors/factoryBubbleProps.ts` | Vent position, seed, tint and depth for a building's bubbles, from the actor alone |
| `src/components/actors/factoryVariants.ts` | `VARIANT_CONF`, variant selection, type definitions |
| `src/components/actors/silhouetteUtils.ts` | Colour math, sizing, greeble generation, anchor transforms |
| `src/systems/factoryPlacementSystem.ts` | Row configs, placement logic |
| `src/constants/colorTheme.json` | Canonical HSL palette (see §Color System) |

---

## Design Philosophy

- **Silhouette-First:** Buildings are identified by their outline. Interior
  detail is decorative only — never load-bearing for readability.
- **90/45 Rule:** Outlines use only vertical, horizontal, or 45-degree
  lines. This keeps forms readable at a glance and fits the salvaged
  industrial aesthetic.
- **Atmospheric Depth:** Per-row L-range compression pushes distant rows
  toward darker, flatter tones. Close rows can reach full brightness;
  far rows cap out lower.
- **Deterministic Randomness:** Every visual property of a factory
  (variant, size, colour shift, greeble selection) is derived from a
  seeded PRNG. Reloading the scene produces identical buildings. Colour
  shift alone has a second, independent seeded input on top — the active
  Attenuation Style's own noise map — additive with the locale-seeded
  shift and affecting colour only; every other property stays locale-only.

### Procedural generation (runtime specifics)

- **PRNG draw order** — The runtime `selectVariantFromSeed` consumes the seeded PRNG in a fixed order so spawn order does not affect any individual derived value. The draw order is: `noiseValue` → `scale` → `hueShift` → `satShift` → `rooftopGreeble` → `facadeGreeble` → `beltCourseCount` → `frontCornerX` → `purpose`. Tests rely on this order; avoid reordering draws without updating tests. (`src/components/actors/factoryVariants.ts`)
- **frontCornerX override** — Although `VARIANT_CONF` contains a `frontCornerX` fallback, the runtime generates a per-instance `frontCornerX` uniformly in `[25..75]` inside `selectVariantFromSeed`. Documentation should not treat the config value as the final split point.

---

## SVG Rules

- **Universal Rectangle:** All factory silhouettes share a single
  rectangular path (`M0,100 L0,0 L100,0 L100,100 Z`) in a 0–100
  viewBox. There are no per-variant path shapes. Skyline variety is
  created entirely by rooftop greebles rendered above the rectangle.
- **Body Clip Path:** A single inset rectangle (`M2,98 V2 H98 V98 Z`)
  masks facade greebles so they don't bleed past silhouette edges.
  Because every factory is the same shape, one clip path definition
  can be shared.
- **Ground Locking:** The bottom of every silhouette aligns to `y=100` in
  the viewBox so that `bottomAnchorTransform` can drop it onto the
  seabed.
- **Front Corner Split:** Each variant defines a `frontCornerX` (0–100)
  that divides the rectangle into an *east facade* and a *west facade*
  for directional lighting (see §Day/Night Cycle). The split is
  rendered via complementary clip rects.

---

## Color System

### HSL Foundation

All factory colours are stored and manipulated in **HSL** (`h: 0–360`,
`s: 0–100`, `l: 0–100`). The canonical palette in
`src/constants/colorTheme.json` is the single source of truth and is
authored directly in HSL format.

### Per-Variant Palette

Each entry in `VARIANT_CONF` defines four base HSL colours:

```typescript
interface VariantColorConfig {
  body: HSL;          // Main silhouette fill
  accent: HSL;        // Secondary structural elements (belt courses, trim)
  greeble: HSL;       // Daytime window / facade detail colour
  illuminated: HSL;   // Night-time lit-window colour (high L)
}
```

### Per-Variant Shift Ranges

Variants also declare the allowed per-instance hue and saturation
variation:

```typescript
colorRanges: {
  hueShiftRange: [minDelta, maxDelta],   // e.g. [-15, 15]
  satShiftRange: [minDelta, maxDelta],   // e.g. [-10, 10]
}
```

### Per-Instance Colour Shift

At spawn time the factory's seed picks a deterministic `hueShift` and
`satShift` within the variant's allowed ranges. These two numbers are
stored on `Actor.config` (serialisable) and remain fixed for the
factory's lifetime. **Only L changes over time** (driven by the day/night
cycle).

```typescript
// Stored on Actor.config
interface ColorShift {
  hueShift: number;
  satShift: number;
}
```

### Accent Lean (Phase 35 — the world leans toward the console palette)

Why: every variant's `body` is the same graphite base (`colorTheme.json`,
15% saturation at 19% lightness), so a whole skyline averaged to grey. The
lean makes the buildings read as one family that belongs with the console's
accent palette, without snapping to it — the console's 25%-transparent
panels sit over the world, so a full snap would oversaturate them.

How (`src/utils/accentLean.ts`, applied in `factoryPlacementSystem.ts`):

1. **The Attenuation Style picks an accent pair**, once per placement pass
   (`deriveAsAccentPair(asNoiseMap)`): a primary hue drawn from the 18
   console accents (`ACCENT_HUES`, in `ROBOT_IDENTITY_COLOR_NAMES` order) at
   dataId `'factory.as.accentPrimary'` with a fixed non-integer offset
   (`ACCENT_PAIR_OFFSET`, the simplex lattice-collapse guard), plus that
   hue's nearest other accent on the wheel (`secondaryFor`, ≤60° apart by
   construction). Per **style**, not per locale: every locale under one
   style shares the pair, and a retransmit moves the whole skyline.
2. **Each factory picks one of the two** by a seeded coin on its index
   (`pickAccentTarget`, dataId `'factory.as.accentPick'`).
3. **The lean is computed from the final pre-lean body** — variant base +
   local shift + AS shift already applied — and returned as one more
   additive `ColorShift` (`computeAccentLean(body, targetHue)`):
   - `hueShift` = `ACCENT_PULL_FRACTION` (0.5) of the shortest arc to the
     target (`hueArc`), so the body travels halfway, never overshoots, and
     never goes the long way round.
   - `satShift` = `ACCENT_SAT_LIFT` (+15), **except** when the post-pull
     hue lands in a capped band (`SAT_CAP_BANDS`, read via
     `satCapFor(hue)`): then `min(lift, cap − body.s)`, which can go
     negative. Two bands today, both capped at 45%: the warm red→orange
     band 330→45 (wrapping through 0; `isWarmHue`) and lime 80→115. Both
     came out of Crawford's visual checkpoints ("like candy", then "a lime
     green sticks out"); yellow, emerald and green sit outside the bands and
     keep the full lift. Add a row to the table, never a third special case.
4. **Folded, not rendered.** `createFactory`'s optional trailing
   `accentTarget` adds the lean to the `hueShift`/`satShift` it already
   stores; `recolorActorsForAttenuationStyle` repeats the identical
   computation with the new style's map (a recolor equals a fresh placement,
   factory for factory — tested). `Factory.tsx`, `factoryBubbleProps.ts`,
   `applyColorShift`, day/night and `Actor.config`'s shape are untouched;
   bubbles inherit the lean through the shift they already read.

Lightness is deliberately **not** part of the lean — some buildings (Stacks
and Warehouse after their negative variant saturation ranges) still read
grey, and that is accepted (spec §7 item 1). Robots are not part of this
phase at all.

### Applying Colour

A single utility replaces the old hex-based pipeline:

```typescript
function applyColorShift(
  base: HSL,
  shift: ColorShift,
  lMultiplier: number, // 0–1, from day/night curve
): string {
  const h = (base.h + shift.hueShift + 360) % 360;
  const s = clamp(base.s + shift.satShift, 0, 100);
  const l = base.l * lMultiplier;
  return `hsl(${h}, ${s}%, ${l}%)`;
}
```

### Greeble Colours

- **Structural greebles** (rooftop machinery, belt courses) inherit the
  factory's shifted H and S and follow the same facade L curve as the
  surface they sit on. Belt courses use the `accent` HSL with a subtle L
  bump (+3–5%) relative to the surrounding facade fill.
- **Window greebles** use the `greeble` HSL during the day (low L) and
  crossfade toward `illuminated` HSL at night (high L), effectively
  inverting the facade's lighting pattern to produce glowing windows in
  darkness.

### Atmospheric Depth (Per-Row L Offset)

Farther depth rows have a compressed L range — their maximum attainable
lightness is capped below 100%. This simulates atmospheric perspective
underwater. `ROW_L_CAP` (`src/constants/sceneDepth.ts`, roadmap Phase 42) is the real constant, and
the cap is now applied:

| Row depth | `ROW_L_CAP` | Notes |
|-----------|-------|-------|
| Foreground (closest) | 1.0 | Full brightness at midday |
| Mid-depth | 0.85 | Slightly muted |
| Far depth | 0.7 | Noticeably darker ceiling |

`Factory.tsx` multiplies `ROW_L_CAP[depth]` into `eastLMultiplier`/`westLMultiplier` before they
reach `applyColorShift`; every scenery renderer does the same with its own depth. Lit elements
(`indicator.powered`, `alert.powered`, `glass.base`, lit windows) are never capped — a light is a
light at any depth.

### Derelict

An actor can roll `config.derelict: true` at placement (`'actor.derelict'`, offset = actor index,
`< row.derelict ?? DERELICT_RATIO` — default `0.25`; see PROCEDURAL_GENERATION.md). Families that
can be derelict: factory, tank, dome, scaffold. Wrecks are always derelict and carry no flag.
Render-time effect (`Factory.tsx` and every derelict-capable scenery renderer):

- `nightDepth` forced to `0` — no lit windows regardless of time of day.
- Lightness cap × `DERELICT_L_CAP` (0.55); body saturation × `DERELICT_SAT` (0.4).
- Factories: the antenna light and any rooftop indicator are also dark.
- Lit elements stay un-capped by `ROW_L_CAP` as above, but are themselves turned off by the
  `nightDepth` forcing — a derelict building is dark, not merely dim.

---

## Day/Night Cycle (Lightness Curve)

Trace Atlas uses a **96-measure day/night cycle** in the lighting helpers, but the
current renderer does not pull these values from the audio transport. Instead,
`Factory.tsx` reads the active locale's local time from the UI store, converts it
into a 0–95 measure-like value, and passes it to `getLighting()` from
`src/utils/lightingUtils.ts`.

### Current lighting implementation

- `getLighting(measure)` uses a sine-based 96-step cycle to produce separate
  east and west lightness multipliers.
- The renderer derives `lightMeasure` from the locale's local time using:
  `lightMeasure = (localTime / 24) * DAY_CYCLE_MEASURES`.
- The per-row atmospheric cap is still applied at render time:
  `effectiveL = facadeL * rowMaxL`.
- **Illuminated windows** are driven by `nightDepth` and the per-building
  `flickerEpoch`, not by a separate per-window state machine.

### Front Corner Rendering

Each variant defines `frontCornerX` in viewBox coordinates (0–100). The
renderer draws the rectangular base **twice**, each clipped to one side:

```svg
<!-- Shared rectangular path -->
<!-- pathD = "M0,100 L0,0 L100,0 L100,100 Z" -->

<!-- East facade: left of frontCornerX -->
<clipPath id="east-clip-{id}">
  <rect x="0" y="0" width="{frontCornerX}" height="100" />
</clipPath>
<rect x="0" y="0" width="100" height="100" fill={eastFill}
      clip-path="url(#east-clip-{id})" />

<!-- West facade: right of frontCornerX -->
<clipPath id="west-clip-{id}">
  <rect x="{frontCornerX}" y="0" width="{100-frontCornerX}" height="100" />
</clipPath>
<rect x="0" y="0" width="100" height="100" fill={westFill}
      clip-path="url(#west-clip-{id})" />


## Runtime fields & timing

When factories are created at runtime, `createFactory` stashes per-instance derived fields on `Actor.config` (`row`, `hueShift`, `satShift`, `rooftopGreeble`, `facadeGreeble`, `beltCourseCount`, `purpose`) so they are serialisable and available to renderers and systems.

Factories no longer carry production state. `config.productionInterval`, `cooldownRemaining`, `isOffline`, `offlineSince` and the `PRODUCTION_INTERVAL` constant were removed in roadmap Phase 43 (Task 6): nothing read them, and the interaction system that once might have was deleted with them. A building's "readiness" for robot work is live work-loop state, never stored on the `Actor` (see "Robot jobs" below).

Other related runtime details:
- Bubble/vent timing: each building's burst interval is `TARGET_GLOBAL_BURST_INTERVAL_SECONDS * totalBuildings` (currently 4s × the locale's total bubble-eligible building count, computed once in `OceanScene.tsx` and passed to `BubbleLayer`'s `totalBuildings` prop) — plain wall-clock time, deliberately decoupled from `bpm`/measures since the effect is decorative, not musical. This spreads bursts so roughly one building bubbles every ~4s world-wide, rather than every building bursting on the same fixed interval regardless of how many buildings exist. Per-burst parameters (count, radius, stagger, wobble, rise) are seeded; see `src/components/actors/BubbleStream.tsx`.
- `depthScale` (foreground 1, midground 0.5, background 1/3 — derived from the row label in `factoryBubbleProps.ts`) scales bubble radius, wobble amplitude and the minimum rise height so vents in distant rows read as smaller and further away. Rise speed is not scaled.

Runtime files to reference:
- `src/components/actors/factoryVariants.ts` — variant config and `selectVariantFromSeed` (PRNG draw order).
- `src/components/actors/silhouetteUtils.ts` — `calcSilhouetteSize`, `bottomAnchorTransform`.
- `src/systems/factoryPlacementSystem.ts` — `createFactory` and `getRecipeRow`; row tables live in
  `src/systems/districtRecipes.ts` (see "Districts" below).

Facade greebles on each side receive the L multiplier of their respective
facade. Rooftop greebles centred over the split use the average of
east/west L.

## Districts

Each locale is one of nine seeded **districts** (`src/systems/districts.ts`, `src/systems/districtRecipes.ts`
— roadmap Phase 42). `pickDistrict(noiseMap)` draws `'locale.district'` once on the locale noise
map and maps it to a `DistrictName` (`dense · outskirts · towers · yard · derelict · habitat ·
wreckfield · ventfield · construction`). `placeDistrict(localeId)` replaces the old single fixed
row table: it picks the district, builds the terrain profile (see "Terrain" below), and places
every row of that district's recipe.

A recipe is an ordered list of `DistrictRow`s:

```typescript
interface DistrictRow {
  depth: 'background' | 'midground' | 'foreground';
  anchor: 'ridge' | 'floor' | 'ground' | 'offscreen';
  floorY?: number;            // anchor 'floor' only
  spread: 'full' | 'center' | 'edges';
  count: number;
  centerWidth?: number;       // 'center' — fraction of WORLD_BOUNDS.width
  edgeWidth?: number;         // 'edges'  — fraction per side
  kind: 'factory' | SceneryKind;
  variants?: FactoryVariant[]; // kind 'factory' only
  derelict?: number;          // per-row override of DERELICT_RATIO
}
```

Rows say **where an item stands**, never a literal `y`. The three spreads (`edges`/`full`/`center`)
are unchanged from the legacy table, including the seeded `factory.spacing` jitter for `center`;
placement still computes each factory's silhouette size via `calcSilhouetteSize` and advances by the
computed width to avoid overlaps.

### Anchors and the ground-lock invariant

`placeDistrict` resolves each row's `anchor` into the actor's real `Actor.position.y`, from the
terrain profile:

| Anchor | Base y | Who |
|---|---|---|
| `ridge` | `ridgeYAt(x)` | background rows standing on the ridge |
| `floor` | `row.floorY` | the default for background and midground rows |
| `ground` | `groundYAt(x)` | the default for foreground rows |
| `offscreen` | below the frame bottom | foreground rows whose base is cut by the frame |

**Invariant:** after placement, every actor's base is on a terrain profile, under the ground
polygon, or at/below the frame bottom — no visible base floats. This is asserted by a test that
runs every district across 20 seeds.

### `config.district` and `getRecipeRow`

A row index alone cannot be resolved without knowing which district's table it indexes into, so
every placed actor stores both `config.row` **and** `config.district: DistrictName` (serialisable,
written once by `placeDistrict`). Render-time readers (`Factory.tsx`, `factoryBubbleProps.ts`, the
recolor path) resolve the variant filter and depth label via
`getRecipeRow(actor.config.district, actor.config.row)`, which replaces the now-removed
single-argument row lookup. Rows past the end of the recipe are its job-coverage top-ups, in list
order (see "Robot jobs" below), so every reader resolves a top-up with no special case.

Placement is deterministic per actor (seeded) and respects row depth for rendering order (background → midground → foreground).

---

## Scenery families

Roadmap Phase 42 D2 lands the sixteen non-factory **scenery families** a district recipe can place
(`src/components/actors/scenery/`, docs/specs/WORLD_VIEW_DISTRICTS.md §1.8–§1.11):
`tank · crane · pylon · wall · beacon · pipeline · dome · wreck · turbine · boulder · vent ·
containers · scaffold · tether · floodlight · dish`. `Actor.config.kind: SceneryKind` selects the
family; `ActorType.SCENERY` distinguishes it from `ActorType.FACTORY`. `Scenery.tsx` (memoised, same
`staticVisual` pattern as `Factory.tsx`) dispatches on `SCENERY_RENDERERS[kind]`, and `OceanScene`
renders scenery actors in the same per-depth groups as factories, interleaved by `config.row` so
z-order always follows the recipe.

### The `SceneryContext` contract

Every renderer is a pure function `(ctx: SceneryContext) => JSX` (`scenery/sceneryTypes.ts`), built
once per actor by `Scenery.tsx`:

```typescript
interface SceneryContext {
  actor: Actor;
  params: SceneryParams;          // Alea(actor.id)-derived once per actor (sceneryParams.ts)
  cap: number;                    // ROW_L_CAP[depth] * (derelict ? DERELICT_L_CAP : 1)
  eastL: number; westL: number;   // getLighting(lightMeasure) — cap-free; the renderer applies cap
  nightDepth: number;             // 0 when derelict
  accent: AccentPair;             // the active style's accent pair (deriveAsAccentPair)
  gems: boolean;                  // the SCENERY_GEM_ACCENTS build flag
}
```

A renderer never reads the lighting tick, the recipe table or `ROW_L_CAP` directly — `Scenery.tsx`
resolves all of it into `ctx` so every family sees the same shape, the scenery equivalent of
`Factory.tsx` recomputing its own per-tick colour math.

### Gem accents

`scenery/gemShape.tsx`'s `GemShape` draws a chamfered polygon in the Phase 39 gem-robot vocabulary —
chamfer, three facet tones, one outline — but **reuses** `gemShading.ts`'s tone quantisation
(`quantizeShade`) rather than the robot generator (`getRobotGem`): a rock or a beacon head is one
polygon, not a body. Pylon heads, beacons and boulders carry gem accents (beacon is a gems-only
family — `placeDistrict` skips its rows when `SCENERY_GEM_ACCENTS` is off); boulders pass a neutral
base and `lit: false` so they rhyme with the robots instead of reading as one.

### Body-bearing vs structural families

Five families carry a body that recolors like a factory's: **tank, wall, dome, containers,
scaffold**. Each stores a local `hueShift`/`satShift` (its own range in `sceneryParams.ts`) that
`placeDistrict` folds with the active Attenuation Style's shift and the Phase 35 accent lean via the
shared `foldBodyShift()` (extracted from `createFactory`) into `Actor.config.hueShift`/`.satShift` —
the same two stored numbers a factory uses, read the same way by the renderer.

The remaining structural families — **crane, pylon, pipeline, turbine, tether, floodlight, dish,
wreck, vent, boulder** — use fixed palette tones from `colorTheme.json` and store no shift; they
look the same under every Attenuation Style.

### Recolor coverage

`recolorActorsForAttenuationStyle` (see "Applying Colour" above, where it is generalised from
factories to every body-bearing actor) iterates every actor with a body — factory or scenery — re-deriving the
local shift and folding the new style's shift and lean, so a Sector Settings retransmit recolors
walls, tanks, domes, containers and scaffolds right alongside the skyline. Structural families are
untouched, since they store no shift to recompute.

### The 90/45 test helper

Every scenery shape, like every factory shape, draws on a 90°/45° grid. `assertNinetyFortyFive`
(`scenery/sceneryTestHelpers.ts`) walks an SVG root and asserts every `rect`/`polygon`/`line` edge is
horizontal, vertical or exactly 45°, treating the interior of a `rotate(±45)` group (turbine's blades,
dish's ellipse) as grid-by-construction rather than failing it. Every family's test runs this helper
over 50 seeds.

---

## Atmosphere

Roadmap Phase 42 D3 adds one atmosphere layer: `LightShafts` (`worldView/LightShafts.tsx`), 3–5
static polygons in the back layer, after `WaterColumn` and before the terrain ridge. Each has one
vertical edge and one 45° edge (the scenery families' own grid rule), seeded on the locale's own
noise map (`'atmos.shaft.*'` dataIds), and fills with a vertical gradient from `glass.base` at opacity
`0.11 × (1 − nightDepth)` down to 0 — sold at midday, gone at night (the group renders nothing once
that opacity drops below 0.005). It reads the lighting tick the same way `WaterColumn` and
`TerrainLayer` do: no GSAP, no CSS transition, a re-fill only when the rounded hour steps.

A second element, `MarineSnow` (140 static particulate circles in the front layer), was built,
shown to Crawford at a dev-server review, and **cut**: at that density it read as film grain over
the scene rather than drifting particulate, making the world look stiller instead of more alive —
the opposite of the intent. Three motion variants (continuous drift, teleport-with-fade, an
opacity-only twinkle) were perf-measured as a follow-up; none changed the verdict that static
particulate doesn't belong in this scene. See docs/specs/WORLD_VIEW_DISTRICTS.md's 2026-10-07
amendment and docs/tasks/WORLD_VIEW_DISTRICTS.md Task 21 for the full record — if marine snow is
ever revisited, the twinkle shape is the one with headroom (it measured as free), but it needs a
new design pass, not a reinstatement of what was cut.

---

## Robot jobs — hosts, work sites, coverage (Phase 43)

Roadmap Phase 43 ([spec](specs/ROBOT_JOBS_AND_STATIONS.md)) gives robots work at the buildings.
Its first branch (J1) built the world data below. The work loop that uses it lands in J2, so in J1
nothing on screen changes except the coverage top-ups.

### Hosts (`src/systems/jobHosts.ts`)

`hostJobs(actor): JobType[]` lists the jobs a building hosts; empty means "not a host". Factories
host by variant (`FACTORY_HOST_JOBS`) and scenery by kind (`SCENERY_HOST_JOBS`). The full table
is spec §1.3. Wall, boulder and tether host nothing, and pipe bridges are not actors. Three
overrides apply, in this order:

1. **Off screen means no job.** An actor in an `offscreen` row hosts nothing, and so does one whose
   drawn body lies wholly outside `[0, WORLD_WIDTH]`. A body that straddles an edge still hosts.
   This rule removed 43 grid hosts: 8 foreground Warehouses past the right edge, and 35 foreground
   floodlights that the left-edge spread (starting at x = −20) puts wholly off-screen, with only
   their beams reaching in.
2. **Non-hosts stay non-hosts**, derelict or not.
3. **Derelict hosts** host `[salvage, structuralInspection]` instead of their normal list (a dead
   tank doesn't vent). Wrecks are always derelict.

`isWorkSiteEligible(actor, { backHosts })` adds the depth filter. Background hosts only count when
`BACK_HOSTS_ENABLED` is on, and it stays `false` until the depth-layers branch (J4) passes its gate.
An unresolvable row counts as foreground, like `Factory.tsx`'s render fallback.

### Factory geometry (`src/components/actors/factoryGeometry.ts`)

`factoryGeometry(actor)` was cut out of `Factory.tsx`'s `staticVisual`, and `Factory.tsx` now calls
it, so the renderer and the work sites can't drift apart. It returns `{ variant, width, height,
frontCornerX, box }` in scene units. It uses `selectVariantFromSeed` with the row's `variants`,
then `calcSilhouetteSize`, then the bottom-anchor maths. `box.y0` is rounded the way
`bottomAnchorTransform` rounds the rendered translate, so the box is the drawn body exactly, and
its bottom can sit up to 0.5 units off `actor.position.y`. `jobHosts.ts` reads the variant from
here too.

### Work sites (`src/systems/workSites.ts`)

`getWorkSite(actor): WorkSite | null` returns one per host, `null` for a non-host:
`{ id, depth, jobs, bounds, park, points, path }`.

- **`bounds`** is the silhouette box: `factoryGeometry`'s box for factories. For scenery it is the
  per-kind anchor function's box, which contains every drawn shape, with lights up to 40 above.
- **`park`** is where a robot's *centre* sits while working: `PARK_CLEARANCE` (70) above the roof,
  seeded ± 40 sideways from `Alea(id + ':park')`, and clamped into the world (`WORLD_MARGIN` 100).
  The sideways placement uses only the part of the roof inside `[0, WORLD_WIDTH]`. The clamp has
  one gap: a background Skyscraper's roof can sit as high as y = 48, so its park lands *below* the
  roof line. Background sites are ineligible until J4, and J4 must decide whether to drop such
  sites or park beside them.
- **`points`** (2–4 work points: mouths, valves, mast heads, roof corners) and **`paths`** come
  from the site's own `Alea(id + ':work')` stream, never per robot. `paths.outline` (a polyline of
  at least 2 points: the top outline, a hull line) is always there; `paths.pipe` (the pipe run) is
  only on a pipeline, and a site without one traces its outline instead.
- **Foreground rule:** foreground buildings draw *over* the robots, so a foreground site's points
  and path lie on or above its top outline. Orbiters work at the silhouette from outside. Midground
  and background sites may also use facade points (a tank gauge, a dome hatch, container labels).
- **Factories** use variant-specific points. Stacks and Refinery get `[mouth, valve]`, where the
  mouth is the bubble vent's x (`factoryVentFraction`, shared with `factoryBubbleProps.ts`).
  Warehouse gets one point in each half of the roof. Monolith and Skyscraper get a seeded mid point
  plus the roof's 10 % and 90 % points. Points and path use the visible part of the roof.
- **Scenery** uses `sceneryWorkAnchors(actor, …)` (`scenery/sceneryWorkAnchors.ts`), one anchor
  function per hosting kind (`ANCHORED_KINDS`), reading only `deriveSceneryParams(actor)`. Where a
  renderer's geometry was more than a one-liner, it moved into an exported layout helper that the
  renderer and the anchors both call: `domePortholeCentres`, `scaffoldBraces`, `containerRows`,
  `wreckLayout`, `craneLayout`, `pylonArms`, `beaconGem`, `pipelineLayout`, `turbineLayout`,
  `floodlightLayout` and `dishLayout`. Render-parity tests check every named anchor against the
  element it names in the rendered DOM. Turbine and dish anchors apply their renderer's rotation.
- **Caching is by the actor object (`WeakMap`), never the id.** Actor ids repeat across locales:
  730 of 4210 actors over the 121-seed grid share an id with another locale's actor, and 652 of
  those have different geometry. `deriveWorkSite` is the uncached derivation.

Found while building the anchors and not fixed (it's renderer scope): the crane's knee brace in
`renderers/crane.tsx` is a zero-area polygon, all four vertices on one 45° diagonal, so it draws
nothing. The anchors ignore it.

### Coverage guarantee (`src/systems/jobCoverage.ts`)

Every world must have **at least 3 jobs with at least 4 eligible midground + foreground hosts
each** (`COVERAGE_MIN_JOBS`, `COVERAGE_MIN_HOSTS`). Only those depths count, so the guarantee holds
whether or not J4 ships. `placeDistrict` ends with `ensureJobCoverage(actors, topUps, place)`,
which is pure (the placer is passed in). It counts hosts per job (`jobHostCounts`). While
`meetsCoverage` is false, it places the district's next `COVERAGE_TOP_UP` item and checks again.
It stops when the rule holds or the list runs out.

- `COVERAGE_TOP_UP: Record<DistrictName, CoverageTopUp[]>` (`districtRecipes.ts`) gives each
  district an ordered list of `{ kind, depth }`, scenery only, midground or foreground.
- Top-up `i` is an ordinary actor on row `recipe.length + i`. `coverageTopUpRow(topUp)` turns it
  into a `DistrictRow`: ground-locked in the foreground, at the midground floor in the midground,
  `count: 1`, and `derelict: 0` (a derelict roll would swap away the jobs it was placed for). Its x
  is a uniform `'locale.coverage.x'` draw (`getUniformSeededVal`, offset `i`) in the middle 70 %
  of the width (`COVERAGE_CENTER_WIDTH`). One re-hashed sample isn't enough: at offset 0 it put
  every world's first top-up at one of three x positions.
- Top-ups go through the same seeded scenery placement as the recipe rows, so they are recoloured
  in the same order and counted by the element budget. No top-up is a vent, so the vent cap is
  unchanged.
- **Measured (121-seed grid):** 56 worlds fell short before top-ups. That was every ventfield,
  derelict, wreckfield and outskirts world, and 9 of 15 towers. Dense, yard, habitat and
  construction worlds never fall short. The missing third job is nearly always acoustic survey or
  maintenance, so the lists lead with midground pylons, which host both. After top-ups every world
  passes, using 92 top-ups in total and at most 3 per world. This changes how those districts
  look: ventfield always gains a floodlight, a pylon and a crane, and wreckfield gains 3 pylons.
- A list that can't satisfy the rule fails `jobCoverage.test.ts`, so a short list gets fixed in
  data, never at runtime.

### Stations avoid hosts

Charging stations (`src/systems/stations.ts`, spec §1.6) are placed clear of every host's `bounds`
at **every** depth (`hostObstacles`), background included. That way, turning on
`BACK_HOSTS_ENABLED` in J4 can't move a station. The station box is a placeholder (160 × 120)
until the motion sketch supplies Crawford's design.

---

## Size System

### Size Ranges in VARIANT_CONF

Each variant defines a width and height range (in pixels) instead of fixed
native sizes:

```typescript
sizeRange: {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}
```

### calcSilhouetteSize

The noise value maps linearly within the range:

```typescript
function calcSilhouetteSize(noiseValue: number, range: SizeRange) {
  return {
    width:  lerp(range.minWidth,  range.maxWidth,  noiseValue),
    height: lerp(range.minHeight, range.maxHeight, noiseValue),
  };
}
```

The placement system's `computeFactoryWidth` call chain continues to work
— it simply reads from `sizeRange` instead of `nativeSizes`.

---

## Silhouette Variants

All variants share the same rectangular base shape. A variant is now a
**recipe** — a combination of size range, colour palette, greeble pool,
and front-corner position. The skyline silhouette of any given factory
is determined by its rooftop greeble(s), not by a custom path.

### Selection

Variant selection is noise-driven via `getVariantFromNoise` in
`factoryVariants.ts`. A provided list of allowed types is weighted by
order: earlier entries are more likely. Row configs pass custom lists to
bias certain layers.

```typescript
function selectVariantFromSeed(
  id: string, x = 0, row = 1, available?: FactoryVariant[],
) {
  const prng = Alea(id);
  const noise2D = createNoise2D(prng);
  const noiseValue = (noise2D(x / 100, 0) + 1) / 2;
  const variant = getVariantFromNoise(noiseValue, row, available);
  const scale = 0.8 + prng() * 0.4;
  return { variant, scale, noiseValue } as const;
}
```

### What a Variant Defines

With the rectangular base shape being universal, each variant in
`VARIANT_CONF` contributes:

| Field | Purpose |
|-------|---------|
| `sizeRange` | Width/height min–max (see §Size System) |
| `colors` | `VariantColorConfig` — body, accent, greeble, illuminated HSLs |
| `colorRanges` | Allowed per-instance hue/sat shift ranges |
| `frontCornerX` | East/west facade split point (0–100) |
| `greebleConfig` | Pools of allowed rooftop + facade greebles |

Note: `pathD` and `bodyClipPath` are **no longer per-variant**. A single
rectangular path and a single inset clip path are shared by all variants.
### Common Profiles

| Variant | Size Character | Typical Rooftop | Typical Use |
|---------|----------------|-----------------|-------------|
| **Monolith** | Wide, medium-tall | Steppe roof, machinery | Heavy industry |
| **Stacks** | Medium, tall | Crown spire, antennae | Processing plants |
| **Refinery** | Wide, short-medium | Machinery, pitched roof | Chemical/pipe works |
| **Skyscraper** | Narrow, very tall | Crown spire, antennae | Observation/comms |
| **Warehouse** | Wide, short | Pitched roof, steppe roof | Storage/logistics |

---

## Greeble System

Greebles are decorative details placed on factory silhouettes. They fall
into two categories: **rooftop** (above the building path) and **facade**
(inside the body clip path).

### VARIANT_CONF Greeble Declaration

Each variant lists the **pool** of allowed greeble types. At spawn time
the seed selects from the pool — no variant is hard-wired to a single
greeble.

```typescript
greebleConfig: {
  allowedRooftop: RooftopGreeble[];   // pool of possible rooftop details
  allowedFacade: FacadeGreeble[];     // pool of possible facade details
  maxRooftop?: number;                // max rooftop greebles (default: 1)
}
```

```typescript
type RooftopGreeble =
  | 'machinery'
  | 'antennae'
  | 'waterTower'
  | 'cupola'
  | 'crownSpire'
  | 'pitchedRoof'
  | 'steppeRoof'
  | 'pipesValves';

type FacadeGreeble =
  | 'squareWindows'
  | 'wideWindows'
  | 'tallWindows'
  | 'beltCourse'
  | 'pipesValves';
```

### Greeble Renderers

Each greeble type is implemented as a pure function:

```typescript
type GreebleRenderer = (ctx: {
  buildingWidth: number;   // computed pixel width
  buildingHeight: number;  // computed pixel height
  roofY: number;           // top of building in viewBox coords (rooftop only)
  seed: number;            // for deterministic randomness
  colors: {
    body: HSL;
    accent: HSL;
    greeble: HSL;
    illuminated: HSL;
  };
  lMultiplier: number;     // current facade L multiplier
}) => React.ReactElement;
```

**Internal layout/paint split (2026-09-14, [docs/todo/backlog.md #21](todo/backlog.md#21-factory-every-instance-re-renders-oncesec-for-daynight-lighting)):**
of the greebles above, only 5 (`pitchedRoof`/`crownSpire` rooftop; `squareWindows`/
`wideWindows`/`tallWindows` facade) actually read a lighting field (`eastLMultiplier`/
`westLMultiplier`/`nightDepth`/`flickerEpoch`) — those five are internally split into a
`compute*Layout` function (geometry only, memoized once per factory in `Factory.tsx`) and a
`paint*` function (color only, recomputed every lighting tick), wired through
`ROOFTOP_LAYOUT_PAINT`/`FACADE_LAYOUT_PAINT` registries. Every `render<Greeble>` function
documented above **remains the stable public entry point** — the split is an internal
performance detail behind it, not a change to this contract. See
[docs/specs/FACTORY_LIGHTING_RERENDER.md](specs/FACTORY_LIGHTING_RERENDER.md) for the full
design.

---

### Rooftop Greebles

Rooftop greebles are rendered **above** the building path (lower y in SVG
viewBox coordinates). They are not clipped by the body clip path.

#### Machinery
- **Aspect ratio:** ~5 × 3
- **Drawing:** Iterate through columns; each column has a 30% chance of a
  stack appearing. Stack height is random up to the greeble's height
  dimension.

#### Antennae
- **Aspect ratio:** 2 × [5–20]
- **Drawing:** A single tall vertical line with a light at the top that
  flickers (via GSAP ticker-driven opacity pulse). If the aspect ratio
  is 1 × [>10], add a second light at the vertical centre that does
  **not** flicker.

#### Water Tower
- **Aspect ratio:** 1 × 3
- **Drawing:** Bottom third = support stilts, middle third = rectangle
  (tank body), top third = triangle (roof cap).

#### Cupola
- **Aspect ratio:** 4 × 3
- **Drawing:** A rounded dome that spans the full width of the roof
  section it sits on.

#### Crown Spire
- **Aspect ratio:** 3 × 4
- **Drawing:** A stepped/terraced roof attachment spanning the full roof
  width, topped with an antenna.

#### Pitched Roof
- **Aspect ratio:** 1 × 1
- **Drawing:** A right-triangle roof spanning the full roof width. The
  apex is the diagonal edge.

#### Steppe Roof
- **Aspect ratio:** varies (short)
- **Drawing:** Up to three progressively narrower horizontal tiers:
  bottom row ≈ 80% roof width, second ≈ 60%, third (if present) ≈ 40%.
  Each tier is ~1% of building height tall.

---

### Facade Greebles

Facade greebles are rendered **inside** the body clip path. Window grid
dimensions are derived from the computed building width and height rather
than being explicitly configured.

#### Window Grid Derivation

```typescript
function deriveWindowGrid(
  buildingWidth: number,
  buildingHeight: number,
  windowType: FacadeGreeble,
): { cols: number; rows: number; unitW: number; unitH: number } {
  const aspect = WINDOW_ASPECTS[windowType]; // e.g. { w: 1, h: 1 }
  const unit = Math.max(4, buildingWidth * 0.06);
  const cols = Math.floor(buildingWidth / (unit * aspect.w * 1.5));
  const rows = Math.floor(buildingHeight / (unit * aspect.h * 2));
  return {
    cols, rows,
    unitW: unit * aspect.w,
    unitH: unit * aspect.h,
  };
}
```

Wider buildings naturally get more columns; taller buildings get more rows.
Margins are computed from the remaining space.

#### Square Windows
- **Aspect ratio:** 1 × 1
- **Args:** rows, cols, margin-block, margin-row (all derived)
- **Drawing:** For each row, draw `cols` squares across the facade.
  Rows are `margin-block` apart; columns are `margin-row` apart.

#### Wide Windows
- **Aspect ratio:** 4 × 1
- **Args / Drawing:** Same grid logic as square windows with wider
  rectangles.

#### Tall Windows
- **Aspect ratio:** 1 × 4
- **Args / Drawing:** Same grid logic as square windows with taller
  rectangles.

#### Belt Course
- **Aspect ratio:** 100% facade width × a few % tall
- **Drawing:** A full-width horizontal stripe between floors. Colour is
  the variant's `accent` HSL with a subtle L bump (+3–5%) relative to
  the surrounding facade fill.
- **Count:** Derived from building height —
  `Math.floor(buildingHeight / threshold)`. Taller buildings get more
  courses.

---

### Window Illumination

The current implementation does not track a per-window `isLit` state. Instead,
illumination is derived from the current lightness curve and a deterministic
per-building flicker epoch.

**Current rules:**
- `Factory.tsx` computes `eastLMultiplier`, `westLMultiplier`, and
  `nightDepth` from the current day/night cycle.
- Facade greebles use the appropriate face multiplier for their local side,
  while rooftop greebles use a blended roof multiplier.
- Windows and other illuminated details transition toward the variant's
  `illuminated` HSL colour as `nightDepth` rises.
- `FLICKER_PERIOD` controls how often the renderer re-rolls lighting-related
  window states per building; this produces sparse, staggered flicker without
  making every window animate continuously.
- The antennae and other greeble accents are still the main fast-moving visual
  elements; the rest of the facade lighting remains comparatively stable.

---

## Procedural Pipeline Summary

1. `factoryPlacementSystem` creates actors with seeded IDs and row
   assignments.
2. `selectVariantFromSeed` picks a variant, noise value, and base scale.
3. `calcSilhouetteSize` maps noise → concrete width/height within the
   variant's `sizeRange`.
4. Per-instance `hueShift` and `satShift` are derived from the seed and
   stored on `Actor.config`.
5. The seed selects rooftop greeble(s) from the variant's
   `allowedRooftop` pool and a facade greeble type from
   `allowedFacade`. These define the factory's unique silhouette.
6. At render time, `Factory.tsx` reads the current `{ eastL, westL }`
   from the store, applies the per-row atmospheric cap, and renders:
   - The universal rectangular base, split at `frontCornerX` into
     east and west facade fills
   - Facade greebles (clipped by the shared body clip rect, L per
     facade side)
   - Rooftop greebles (unclipped, rendered above the rectangle —
     these create the factory's skyline profile)

---

## Implementation Order

| Step | Scope | Depends on |
|------|-------|------------|
| 1 | HSL colour system — migrate palette, `applyColorShift`, replace hex utils | — |
| 2 | Size ranges in `VARIANT_CONF` — replace `nativeSizes`, update `calcSilhouetteSize` | — |
| 3 | Front corner + east/west facade split rendering | Step 1 |
| 4 | Day/night L function + per-row atmospheric cap | Steps 1, 3 |
| 5 | Greeble registry + rooftop greeble renderers (incremental, one type at a time) | Step 2 |
| 6 | Facade greeble types (windows, belt course) — replaces current window rects | Steps 2, 4 |
| 7 | Window illumination system | Steps 4, 6 |

# Building Design 2.0

This section describes four new visual systems planned for the next pass of
factory building development. Each goal is scoped to what is realistic within
the existing SVG + GSAP + React architecture.

---

## Goal 1 — Variant Purposes (Cosmetic Identity)

**Summary:** Each factory variant is assigned a named industrial purpose.
Purpose is purely cosmetic; it drives the variant's visual language (colour
palette bias, greeble pool) and determines eligibility for other systems
(bubbles, cables). No gameplay behaviour changes.

**Purpose Map:**

| Variant | Purpose |
|---------|---------|
| Monolith | Heavy Industry |
| Stacks | Chemical Processing |
| Refinery | Pipe Works / Refinery |
| Skyscraper | Observation / Communications |
| Warehouse | Storage / Logistics |

**Goals:**
- Each `VARIANT_CONF` entry gains a `purpose` string field.
- Purpose is stored on `Actor.config` at spawn (serialisable).
- Purpose is used as an eligibility gate in the bubble and cable systems.
- No visual change is required beyond what already differentiates variants;
  purpose is a label that makes intent explicit and allows future expansion.

---

## Goal 2 — Bubble Streams

**Summary:** Industrial-purpose buildings emit an occasional *burst* of rising
bubbles from a vent on their roofline. Bursts are rare per building and spread
across the whole locale so that, world-wide, roughly one building bursts every
few seconds. Buildings in the "offline" state (see Goal 3) emit no bubbles.
Timing is plain wall-clock seconds — it has no relationship to the transport
BPM or to measures; the effect is decorative, not musical.

**As built** (`src/components/actors/BubbleStream.tsx`, `isBubbleEligible` in
`factoryVariants.ts`):
- Eligibility: `purpose` is one of `heavyIndustry`, `chemicalProcessing`,
  `pipeWorks`, `storageLogistics` (Skyscraper's `observationComms` is the only
  variant without a vent). An unset `purpose` falls back to `heavyIndustry`.
- One `BubbleStream` per building, rendered by `BubbleLayer` in scene
  coordinates inside the scene's own bubble layer — a compositor layer separate
  from the static factory layers (roadmap 17.2.5; `Factory.tsx` itself renders
  no bubbles). Vent X is seeded to 20–80% of the facade width; vent Y is the
  roofline (`factoryBubbleProps.ts`). Bubbles from every row share the one
  layer: they rise behind the robots and below the foreground factories.
- Each burst releases 5–10 bubbles (seeded), each its own `<circle>` placed at
  the vent once via `cx`/`cy`/`r`. Bubbles are released `0.2–0.4 s` apart
  (seeded), rise `100–500 px` at `40–70 px/s` (so duration follows distance),
  wobble `8–20 px` side to side, fade in over the first 85% of the rise, then
  pop (scale ×2.5, fade out) over the last 15% while still rising. Some pop
  off-screen by design.
- Radius `8–10 px`, scaled by `depthScale` (see "Placement & Rows"). Fill is
  `hsl(bodyHue, 30%, 70%)` — a faint tint of the building's own body hue.
- **Motion is transform-only**: tweens touch `x`, `y`, `scale` and `opacity`,
  never `cx`/`cy`/`r` (docs/ANIMATION_SYSTEM.md). Each burst starts by
  resetting every bubble to `x:0, y:0, scale:1, opacity:0`.
- Burst interval per building = `TARGET_GLOBAL_BURST_INTERVAL_SECONDS` (4 s)
  × the locale's bubble-eligible building count (`OceanScene.tsx` →
  `BubbleLayer`'s `totalBuildings` prop). Each building also gets a seeded
  initial phase offset within its own interval so bursts never line up.
- One GSAP timeline per building (`gsap.timeline({ repeat: -1 })` holding one
  child timeline per bubble), stored in `timelineMap` under `bubble-{actorId}`
  and killed on unmount. While a building is inactive the timeline is rewound
  and paused (`pause(0)`) so its own first `.set()` hides every bubble.
- Honours `prefers-reduced-motion: reduce`: no timeline is built and the
  circles stay at opacity 0.
- **Vent scenery joins the stream (roadmap Phase 42 D2).** `getActorBubbleProps`
  also returns a position for every `vent` scenery actor — the mouth at the
  top of its stepped cone, `isActive`
  always `true`, tinted by the vent's own shadow hue — so vents bubble the
  same way eligible factories do. `OceanScene.bubbleBuildingCount` counts
  vents alongside eligible factories so the ~4s-per-burst world-wide rate
  stays level as districts add vents; every other scenery kind returns `null`.

---

## Goal 3 — Offline State

**Summary:** Very rarely, a building "powers down" — all animated and
illuminated elements switch off for approximately 66 measures before the
building comes back online. This suggests systemic fragility in the
post-apocalyptic world without being a constant visual distraction.

**Goals:**
- `Actor.config` gains two optional fields: `offlineSince?: number` (measure
  at which the building went offline) and `isOffline?: boolean`.
- **Trigger:** Each measure, every building has an independent
  ~`1 / 200` probability of going offline. Approximately 1% of buildings
  are offline at any given time. Offline state is set by a system
  (`offlineSystem`) that runs on each measure tick.
- **Duration:** A building stays offline for `66` measures
  (`currentMeasure - offlineSince >= 66`), then returns online. The same
  system handles recovery.
- **Visual effects while offline:**
  - `nightDepth` forced to `0` — no lit windows regardless of time of day.
  - Bubble stream GSAP timeline is rewound and paused (`BubbleStream`'s
    `isActive={false}` path). The `config.isOffline` wiring was removed
    with the unused fields in roadmap Phase 43 (`factoryBubbleProps.ts`
    passes `isActive: true`), and the `offlineSystem` was never built —
    building this goal means re-adding both.
  - Antennae indicator light `<circle>` elements have `opacity: 0`.
  - Body fill is slightly desaturated (saturation clamped down ~20%).
- Online recovery reverses all of the above instantly (no transition needed;
  the building "reboots").
- The offline state is fully serialisable (two numbers on `Actor.config`).

---

## Goal 4 — Swaying Cables

**Summary:** Power cables hang between adjacent buildings of the **same
variant** in rows where cables are enabled. Each cable is a single SVG
quadratic Bézier path rendered with a catenary sag. Cables drift very
slowly — a near-imperceptible sway triggered by beat events, suggesting
deep-ocean current.

**Goals:**
- Row config (`RowConfig`) gains a `cablesEnabled: boolean` field (default
  `false`).
- At render time, buildings in cable-enabled rows scan for the nearest
  neighbour of the same variant in that row. If one is found within a
  maximum distance threshold (TBD, ~300 px), a cable is drawn between them.
- Cable SVG: a `<path>` using a quadratic Bézier. The two endpoints are
  at the top-edge midpoints of each building; the control point hangs
  ~15–25% of the horizontal span below the endpoints (seeded sag).
- Colour: dark near-black (e.g. `hsl(220, 10%, 18%)`). Stroke width: 1.5 px.
  No fill. Opacity: ~0.6.
- **Sway animation:** A slow GSAP tween nudges the Bézier control point
  ±4–8 px vertically over 12–25 s (seeded duration). The tween uses
  `yoyo: true, repeat: -1, ease: 'sine.inOut'`. It is stored in
  `timelineMap` under `cable-{actorId}-{neighbourId}`.
- Cables are rendered in their own SVG layer beneath the buildings so they
  never occlude facades.
- Cables are not rendered for offline buildings (either endpoint offline
  hides the cable between them).