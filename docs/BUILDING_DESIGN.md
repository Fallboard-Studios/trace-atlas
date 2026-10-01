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
locale's factories in place (`recolorFactoriesForAttenuationStyle()`)
without touching any of those other fields. See
[docs/specs/ATTENUATION_STYLE.md](specs/ATTENUATION_STYLE.md) §1.2.

**Key source files:**

| File | Purpose |
|------|---------|
| `src/components/actors/Factory.tsx` | Renders the silhouette + greebles for a given actor |
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
underwater.

| Row depth | Max L | Notes |
|-----------|-------|-------|
| Foreground (closest) | 100% | Full brightness at midday |
| Mid-depth | ~80% | Slightly muted |
| Far depth | ~60–70% | Noticeably darker ceiling |

The per-row cap is multiplied into the day/night `lMultiplier` before it
reaches `applyColorShift`, so variant code doesn't need to be aware of it.

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


## Runtime fields & production timing

When factories are created at runtime, `createFactory` stashes per-instance derived fields on `Actor.config` so they are serialisable and available to renderers and systems. In particular:

- `config.productionInterval` — set to the `PRODUCTION_INTERVAL` constant (runtime default `60` measures).
- `cooldownRemaining` — initialised to `PRODUCTION_INTERVAL` so production scheduling and UI can read a serialisable cooldown value.

Other related runtime details:
- Bubble/vent timing: each building's burst interval is `TARGET_GLOBAL_BURST_INTERVAL_SECONDS * totalBuildings` (currently 4s × the locale's total bubble-eligible building count, computed once in `OceanScene.tsx` and threaded through `Factory`'s `totalBubbleBuildings` prop) — plain wall-clock time, deliberately decoupled from `bpm`/measures since the effect is decorative, not musical. This spreads bursts so roughly one building bubbles every ~4s world-wide, rather than every building bursting on the same fixed interval regardless of how many buildings exist. Per-burst parameters (count, radius, stagger, wobble, rise) are seeded; see `src/components/actors/BubbleStream.tsx`.
- `depthScale` (foreground 1, midground 0.5, background 1/3 — derived from the row label in `Factory.tsx`) scales bubble radius, wobble amplitude and the minimum rise height so vents in distant rows read as smaller and further away. Rise speed is not scaled.

Runtime files to reference:
- `src/components/actors/factoryVariants.ts` — variant config and `selectVariantFromSeed` (PRNG draw order).
- `src/components/actors/silhouetteUtils.ts` — `calcSilhouetteSize`, `bottomAnchorTransform`.
- `src/systems/factoryPlacementSystem.ts` — `FACTORY_ROWS` and placement algorithm.

Facade greebles on each side receive the L multiplier of their respective
facade. Rooftop greebles centred over the split use the average of
east/west L.

## Placement & Rows (runtime)

The runtime places factories using a row configuration table (`FACTORY_ROWS`) that defines multiple depth rows. Each row entry contains a `y` position, a `spreadType` (`edges` | `full` | `center`), and `factoriesPerRow` which acts as a per-row density cap. Additional per-row fields include `edgeWidth` and `centerWidth` to control the horizontal extents for `edges` and `center` spreads respectively. Placement computes each factory's silhouette size via `calcSilhouetteSize` and advances placement by the computed width to avoid overlaps. See `src/systems/factoryPlacementSystem.ts` for the exact algorithm.

- `edges`: fill left and right bands (edge width configurable) until count reached.
- `full`: spread evenly across the full width with a soft cap of `factoriesPerRow`.
- `center`: constrain placement to a centered segment (configurable `centerWidth`).

Placement is deterministic per actor (seeded) and respects row depth for rendering order (background → midground → foreground).

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
- One `BubbleStream` per building, rendered outside the building's transform
  group in scene coordinates. Vent X is seeded to 20–80% of the facade width;
  vent Y is the roofline.
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
  `Factory`'s `totalBubbleBuildings` prop). Each building also gets a seeded
  initial phase offset within its own interval so bursts never line up.
- One GSAP timeline per building (`gsap.timeline({ repeat: -1 })` holding one
  child timeline per bubble), stored in `timelineMap` under `bubble-{actorId}`
  and killed on unmount. While a building is inactive the timeline is rewound
  and paused (`pause(0)`) so its own first `.set()` hides every bubble.
- Honours `prefers-reduced-motion: reduce`: no timeline is built and the
  circles stay at opacity 0.

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
    `isActive={false}` path — already wired to `config.isOffline`; the
    `offlineSystem` that would set the flag is not yet built).
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