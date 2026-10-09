# Phase Spec: World Gem Material (Option A)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (Vitest; `npx vitest run <path>` for one file)
> - Idle-paint gate: `npm run build && npx vite preview --port 4173`, then
>   `npm run perf:idle --throttle 1 --only none --port 9301 --url <pinned ?session= link>`
> - Dev server: `npm run dev`

Roadmap Phase 44. Idea: [docs/ideas/world-gem-material.md](../ideas/world-gem-material.md). Intent:
[docs/intent/world-gem-material.md](../intent/world-gem-material.md) (confirmed 2026-10-08; where the
intent and the idea doc differ, the intent wins, and this spec follows the intent). Sketch:
[docs/sketches/gem-factories.html](../sketches/gem-factories.html) — sketch gate passed 2026-10-08
("a great little blend of both art styles"), extended and re-judged the same day with the 1.5 px
hairline and the six extra families. Branch `feature/world-gem`.

Every solid in the world reads as one carved material with the gem robots (Phase 39). **Mass** gets
the robots' bevel ring — an inset outline, one facet per edge, three quantized tones, no outline
stroke — lit by the hour's east/west sun. **Everything else solid** gets a 1.5 px hairline outline.
Silhouettes, windows, belts, lamps and greebles do not change. A bevel of 0 renders byte-for-byte as
today.

Every file, function and constant named below was checked against the working tree on
2026-10-08 (`main` at `6802c8b4`); the "Verified against the code" notes record what the intent
got right and the three places the code differs from the sketch.

## Assumptions (correct these before the plan)

1. **The ring is drawn in scene pixels, as a sibling of the scaled body, never inside
   `Factory.tsx`'s 0–100 box.** `Factory.tsx:389` scales the body by
   `(width·scaleX / 100, height·scaleY / 100)` — non-uniform on every non-square building — so an
   8 px ring built in box units would be 8 % of the width one way and 8 % of the height the other.
   The ring goes in a `<g data-gem="ring">` placed after the scaled group and before the rooftop
   greeble, in the same pixel space the rooftop greebles already use (`actualWidth` ×
   `actualHeight`, `Factory.tsx:150`). The window-clip margin and the belt inset, which *do* live in
   the box, are converted per axis (§1.4).
2. **"The item's own scale" is `actor.scaleX` for a factory and 1 for everything else.** Only
   factories carry a scale (`createFactory`, 0.9–1.1, equal on both axes — `districts.ts:230`,
   `factoryPlacementSystem.ts:199`); scenery actors are placed with a position only
   (`districts.ts:196`), terrain and pipe bridges have none. The sketch's per-depth `scale`
   (0.72 midground, 0.5 background) is a stand-in with no live counterpart — the live world does not
   shrink its back rows — so a midground tank gets the same 8 px ring as a foreground one. The
   18 % short-side cap is the only thing that shrinks a ring.
3. **Facet contrast 1.0 means the multipliers are used as they are.** The sketch's
   `1 + (m − 1) × contrast` collapses to `m` at 1.0, so no contrast constant is introduced; a facet's
   lightness multiplier is `faceL × facetMultiplier(quantizeShade(shade, 3))` with the 0.5 / 1.1 /
   1.25 table exported from `gemShape.tsx`.
4. **The hairline is stroke attributes on the element that is already there, not a second
   element.** A stroke drawn on a filled element paints the same pixels as a `fill="none"` copy
   drawn immediately after it (the sketch's `memberOutline`), so the look is the sketch's and the
   element count does not move. The one exception is the dome cap, whose hairline runs along the
   arc only and so needs one open `<path>` of its own.
5. **Ring facets are exempt from the 90/45 edge test** *(accepted by Crawford, 2026-10-08)*. A miter inset keeps every edge parallel to
   its outline edge (so those stay on the grid), but the short edge joining an outer vertex to its
   inner vertex lies on the corner's bisector: 45° at a right angle, **67.5° at a 135° corner** (a
   tank shoulder, the wreck's bow, every terrain step). `assertNinetyFortyFive` would fail every
   mass with a 45° edge. The helper skips elements inside `[data-gem="ring"]`, the way it already
   skips `rotate(±45)` groups — a bisector is the ring's construction, not a drawn silhouette edge,
   and the robots' rings are built the same way. BUILDING_DESIGN.md's "The 90/45 test helper"
   paragraph records the exemption.
6. **A ring below 1 px is not drawn.** `worldBevel` returns 0 when the capped depth would be
   under `RING_MIN_PX` (1), so a 6 px steppe-roof tier does not grow a 1 px ring of three
   invisible facets. Mass scenery and factories never hit this (their short sides are ≥ 28 px);
   it only bites the rooftop boxes.
7. **Rooftop greebles follow the world rule: blocks get the roof-box ring, really thin parts get
   the hairline, curves get the hairline along their arc** *(Crawford, 2026-10-08: "most items get
   the roof box treatment, really thin things only get the outline")*. The ring, at 0.6 × the
   building's bevel through assumption 6's floor, goes on **crownSpire** tiers (each tier is already
   two rects split at the front corner — ringed as one two-faced rect, like the body),
   **waterTower**'s tank body, **machinery**'s stacks, **steppeRoof**'s tiers and **pitchedRoof**'s
   two polygons (the 45° slope triangle and the parapet wall, each from its own face's light —
   single-tone parts use the roof average). The hairline goes on the thin parts: the **antennae**
   shaft, **pipesValves**' pipes and valve discs, waterTower's stilts and crownSpire's antenna rod.
   **cupola** takes the hairline along its arc only (one open path, like the dome cap). The antenna
   indicator lights are lamps and do not change. **machinery, waterTower and steppeRoof become
   lighting-dependent** (the ring needs the hour) and move from the static slot to the
   `ROOFTOP_LAYOUT_PAINT` compute/paint split that `crownSpire` and `pitchedRoof` already use; the
   hairline's colour is fixed, so antennae, pipesValves and cupola stay static.
8. **The facade grid is re-centred inside the ring, as the sketch does** *(Crawford, 2026-10-08:
   "centering is great")*. The window clip margin becomes `max(ring depth, 2 %)` per axis, and the
   facade zone bounds the grid is derived over shrink by the same margin, so no window ever sits
   half under the ring. At bevel 0 the margin is today's 2 % and the layout is byte-identical.
   *Caution for the plan:* the facade layout contexts mix units today — `buildingWidth`/
   `buildingHeight` are silhouette pixels while `zoneY`/`zoneHeight`/`frontCornerX` are 0–100 box
   units (`Factory.tsx:186`) — so the re-centring is proven on the rendered window rects, not on
   the context fields.
9. **The wall's cap rail and the tank's belt courses sit inside the ring, inset by the ring depth
   on both sides (and the rail by the depth from the top)** *(Crawford, 2026-10-08: "match the
   spirit, move the rail"; tank belts: "sounds good")*. The intent's "left exactly as they are"
   means neither ringed nor hairlined; without the inset the ring's top facet would bury the 5 px
   rail. Inset by the depth only, so bevel 0 is byte-identical.
10. **Stroke widths count toward the midground silhouettes, and that is fine.**
    `svgElementExtent` widens a stroked shape by half its stroke (`svgElementExtent.ts:194`), so a
    hairlined midground member's silhouette box grows by 0.75 px. `midgroundSilhouettes.test.tsx`
    measures the box and the shapes the same way, so it stays tight and green; a 0.75 px wider
    no-switch zone changes nothing a robot can see.

## 1. Overview & Claude Explanation

### 1.1 The light (`worldLightVector`)

The sun on a building is the hour's east/west sun, never the robots' fixed top-left `GEM_LIGHT`:

```ts
/** The lighting curve's widest east/west gap (getLighting: eastL 1.05 vs westL 0.346 at 9 am). */
export const LIGHT_LATERAL_SPAN = 0.7;

/** Unit vector toward the light (y down): sideways by the hour's east/west gap, always from above. */
export function worldLightVector(eastL: number, westL: number): GemPoint {
  const sx = (eastL - westL) / LIGHT_LATERAL_SPAN;
  const k = Math.hypot(sx, 1);
  return [sx / k, -1 / k];
}
```

A facet's shade is its edge's outward normal (`edgeNormals`, `polygon.ts`) dotted with this
vector, then `quantizeShade(shade, 3)` (`gemShading.ts`). So at 9 am the top and the east (right)
facets are lit and the west and bottom shaded; at noon `sx ≈ 0` and both sides quantize to
neutral; at night every face is near the lightness floor anyway. Lateral strength is 1.0 (the
sketch's slider at its ruled value), so no constant is introduced for it.

**Verified against the code:** `getLighting` (`lightingUtils.ts:90`) peaks east at 1.05 with west
at 0.15 + 0.9 × 0.5^2.2 = 0.346 — a gap of 0.704, so 0.7 is the curve's span to two places.
`gemShading.test.ts`'s style of test pins it (§5).

### 1.2 The ring (`worldBevel`, `ringFacets`, `GemRing`)

**Depth.** `polygon.ts`'s `bevelDepth(w, h)` gains a depth parameter in place of a second copy of
its 18 % cap:

```ts
export function bevelDepth(w: number, h: number, depth = GEM_BEVEL_DEPTH): number {
  return Math.min(depth, BEVEL_SHORT_SIDE_SHARE * Math.min(w, h));
}
```

The world's depth is `WORLD_BEVEL_PX` 8 × the item's scale (assumption 2), through the same cap,
floored to 0 under `RING_MIN_PX` (assumption 6):

```ts
export function worldBevel(w: number, h: number, scale = 1, depthPx = WORLD_BEVEL_PX): number {
  const d = bevelDepth(w, h, depthPx * scale);
  return d < RING_MIN_PX ? 0 : d;
}
```

Roof boxes pass `depthPx = WORLD_BEVEL_PX × ROOF_BOX_BEVEL_FACTOR` (0.6).

**Geometry and tones.** `ringFacets` is the sketch's `ringPoly` over the robot generator's own
`inset` and `edgeNormals`, so no new polygon code exists for the scenery families:

```ts
export interface RingOptions {
  /** Split every horizontal edge that crosses this x first, so each half takes its own face's
   *  light — the facade's west/east split (two-faced bodies). */
  splitX?: number;
  /** Drop the facets of edges that lie on the frame (terrain: x = 0, x = W, the bottom). */
  skipEdge?: (a: GemPoint, b: GemPoint) => boolean;
}

/** One merged <path> per (fill, stroke) pair — the robots' facetPaths, keyed on both strings. */
export function ringFacets(
  pts: readonly GemPoint[],
  depth: number,
  light: GemPoint,
  faceLightAt: (midX: number) => number,   // the face's own lightness multiplier, cap folded in
  body: HSL,                               // the face's own colour, derelict desaturation folded in
  opts: RingOptions = {},
): Array<{ fill: string; stroke: string; d: string }>
```

For edge `i` (`a → b`): `shade = N[i] · light`, quantized to −1 / 0 / 1;
`fill = applyColorShift(body, NO_SHIFT, faceLightAt(midX) × facetMultiplier(q))`;
`stroke = applyColorShift(body, NO_SHIFT, faceLightAt(midX) × facetMultiplier(−1))` (the fully
shaded tone, as the robots' facet stroke is their darkest tone); the facet is the quad
`[a, b, inner[j], inner[i]]`. Facets sharing a (fill, stroke) pair merge into one path, done up
front as the intent requires, never as a later cut. `depth ≤ 0` returns `[]`. Going through
`applyColorShift` keeps the whole-percent lightness rounding, so a facet fill only changes string
when the lighting tick moves it, like every other static fill.

**Renderer.** `GemRing` is a draw-only component:

```tsx
<g data-gem="ring">
  {facets.map(({ fill, stroke, d }) => (
    <path d={d} fill={fill} stroke={stroke} strokeWidth={RING_FACET_STROKE_PX * scale} strokeLinejoin="round" />
  ))}
</g>
```

It returns `null` — not an empty `<g>` — when there are no facets, which is what makes bevel 0
byte-identical. `RING_FACET_STROKE_PX` is 0.6 (the sketch's `0.6 × s`). No `style`, no
transition.

**Verified against the code:** `inset` picks outward normals from the winding, so either winding
works; a collinear vertex (the `splitX` insertion) hits the `|den| < 1e-9` branch and returns the
offset point directly beneath it, which is the correct inner vertex. `facetPaths` in
`gemPaths.ts` keys on fill only; the ring needs the pair, so `ringFacets` has its own merge rather
than widening `facetPaths`'s signature for one caller.

### 1.3 The hairline (`hairline`)

```ts
export const HAIRLINE_PX = 1.5;  // tuned by eye in the sketch: 1 vanished at half size, 2 passed over

/** Stroke props for a non-mass solid, or undefined when the hairline is off. Spread onto the element. */
export function hairline(scale = 1): { stroke: string; strokeWidth: number } | undefined
```

The colour is the scenery gem outline's: `body.shadow` at 0.8 lightness, through
`applyColorShift` (today a private constant in `gemShape.tsx`, exported as `gemOutlineStroke()` so
there is one copy — docs/DUPLICATE_VALUE_AUDIT.md's bug class). It is never lit, never capped. On
the darkest steel (`body.shadow × 1.15` on a pylon) it is nearly the fill's own tone; Crawford
accepted the look as sketched, and the lever if the live view loses it is the colour, not the
weight.

The hairline is applied as attributes on the existing element (assumption 4). The crane hanger, the
one stroked `<line>` in the renderers, becomes a `<rect>` of the same footprint (3 wide, centred on
`hangerX`, from the beam's bottom to `hangerBottomY`) so it takes the hairline like every other thin
member; `crane.test.tsx` and `sceneryWorkAnchors.ts` read the load and `craneLayout`, not the
hanger element, so neither changes.

### 1.4 Factories (`Factory.tsx`)

In pixel space, with `W = width × scaleX`, `H = height × scaleY`, `fcPx = frontCornerX / 100 × W`
(already computed for the rooftop context) and `d = worldBevel(W, H, scaleX)`:

- **Ring:** `ringFacets(rect(0, 0, W, H), d, light, midX => midX < fcPx ? westL × lCap : eastL × lCap,
  bodyColor, { splitX: fcPx })` — six facets (top and bottom split at the front corner, each half
  from its own face's light, matching the facade), drawn in `<g data-gem="ring">` after the scaled
  body group and before `rooftopElement`. `bodyColor` is the derelict-desaturated body
  (`Factory.tsx:287`) and `lCap` the depth × derelict cap, exactly the multipliers `westFill` /
  `eastFill` use — so a derelict's ring dims with its building and a background building's ring is
  capped with it.
- **Window clip** (`Factory.tsx:381`): the body clip rect becomes
  `x = mx, y = my, width = 100 − 2mx, height = 100 − 2my` with `mx = max(100 d / W, 2)` and
  `my = max(100 d / H, 2)` — today's 2 % per axis, or the ring if deeper. At `d = 0` it is
  `2, 2, 96, 96`, byte-identical.
- **Belt courses** (`Factory.tsx:361`): the west rect runs `x = bx` to `frontCornerX` and the east
  from `frontCornerX` to `100 − bx`, with `bx = 100 d / W` — inset by the ring only, so at `d = 0`
  they span the full width as today.
- **Roof boxes** (assumption 7): `rooftopGreebles.tsx` gains a ring on crownSpire tiers,
  waterTower's body, machinery's stacks, steppeRoof's tiers and pitchedRoof's slope and wall at
  `worldBevel(w, h, 1, WORLD_BEVEL_PX × ROOF_BOX_BEVEL_FACTOR)` — rooftop geometry is already in
  pixels, outside the scaled group. crownSpire tiers split at `ctx.frontCornerX` and pitchedRoof's
  two polygons take the west/east multipliers their fills use; the other three are single-tone at
  `ctx.lMultiplier` (the roof average) on `ctx.colors.accent`. The thin parts (antennae shaft,
  pipesValves pipes and valves, waterTower stilts, crownSpire's antenna rod) take `hairline()`;
  cupola takes it along its arc. The light vector reaches the greebles through a new optional
  `GreebleRendererContext.light?: GemPoint`, set by `Factory.tsx`'s paint context. machinery,
  waterTower and steppeRoof move into `ROOFTOP_LAYOUT_PAINT` (compute the rects once, paint the
  fills and ring per tick); `renderMachinery` etc. stay as thin wrappers so `midgroundSilhouettes.ts`
  and the existing tests keep calling them.
- **Facade grid** (assumption 8): the facade layout contexts shrink their zone bounds by the ring
  margin per axis so the grid is centred inside the ring; proven on the rendered rects.
- **Light:** `worldLightVector(eastLMultiplier, westLMultiplier)` once per render, beside
  `roofLMultiplier`. The debug `LIGHTING_PRESETS` drive it the same way they drive the fills.
- **Nothing else moves:** `staticVisual`'s dependency list, `bottomAnchorTransform`, the facade
  renderers, `BubbleLayer`, the item-21 memo split.

### 1.5 Mass scenery (`scenery/renderers/*.tsx`)

Every renderer works in scene pixels at scale 1 and keeps its draw order; the ring is appended
after the body it rings and before any lamp, gauge, porthole or label that sits on the face:

| Family | Ringed polygon(s) | `faceLightAt` | `splitX` | Notes |
|---|---|---|---|---|
| tank | the shouldered hexagon (both faces as one outline) | `midX < splitX ? westL·cap : eastL·cap` | the corner | belts inset by `d` on both sides (assumption 9); gauge unchanged |
| wall | the full rect | west/east at `x` | `x` | cap rail inset by `d` from the top and both sides (assumption 9) |
| dome | the base rect only | west/east at `x` | `x` | cap, portholes, hatch plate unchanged; mast and cap arc take the hairline (§1.6) |
| containers | each box | the box's ambient | — | label square unchanged, drawn after the ring |
| scaffold | the solid lower block | west/east at `x` | `x` | posts, levels, braces take the hairline |
| wreck | the hull (stern block + raked bow as one quadrilateral `[x−w/2,y] [x−w/2,top] [splitX,top] [x1,y]`), the deckhouse, the funnel | hull: `midX < splitX ? westL : eastL` × the wreck's own 0.5 cap; deckhouse/funnel: the superstructure average | — | deck rail, portholes, keel strip unchanged (the hull ring is drawn last, over the keel strip, as sketched) |
| vent | each step rect, one ring per step | the body's lit level (`avgL × cap × 1.3`) | — | the union polygon's ~3 px ledges are narrower than the bevel; plumes and mouth glow unchanged |
| crane | the load | the load's ambient | — | posts, beam, brace, hanger take the hairline |

Body colour passed to `ringFacets` is the renderer's own already-folded colour (derelict
desaturation, the wreck's forced saturation, the vent's `shadowDepth`), so the ring is always the
face's own material.

**Verified against the code:** every table row matches the renderer as shipped (tank's `corner`
lands strictly between the shoulder zones, so the split never cuts a 45° edge; the wreck's hull is
two polygons whose union is the quadrilateral above; vent steps come from `ventSteps` and shrink by
0.9 per step — the sketch's `~3 px` ledge is an estimate, the real ledge is `0.05 × width` per side,
still narrower than 8 px on any vent under 160 wide, i.e. all of them).

### 1.6 Everything else solid: the hairline (`scenery/renderers/*.tsx`, `pipeBridges.tsx`)

`{...hairline()}` on each of:

- **members:** pylon tower polygon and three cross-arm rects; scaffold posts, levels and braces;
  crane posts, beam, knee brace and the (now rect) hanger; dome mast; beacon mast and foot plate;
- **curves:** the dome cap — one extra `<path d="M … A … A …" fill="none">` along the arc from
  `(x − rx, top)` over the apex to `(x + rx, top)`, after the two cap halves (the base edge belongs
  to the ring); the dish reflector ellipse; the turbine hub circle;
- **the six families:** dish (post, reflector, feed), turbine (post, nacelle, both blades, hub),
  floodlight (mast, arm, head), tether (anchor, line, dog-leg, riser), pipeline (stanchions, pipe,
  riser, flange), pipe bridges (bar, post — in `pipeBridges.tsx`, which is not a scenery actor and
  has no lighting; the hairline colour is fixed anyway).

**Left exactly as they are:** boulders, beacon heads, pylon heads (`GemShape`, with its own 2 px
outline), charging stations; windows, belt courses, lamps, portholes, indicator lights, labels; the
wreck's deck rail and keel strip, the dome's hatch plate; the floodlight's lit bar, beam and pool;
vent plumes and mouth glow; the pipeline's highlight strip and valve; the tether float; the
turbine's hub light; the dish's centre light.

### 1.7 Terrain (`TerrainLayer.tsx`)

The ridge and ground polygons (`profile top + (W, H) + (0, H)`) get
`ringFacets(points, WORLD_BEVEL_PX, light, () => fillMultiplier, base, { skipEdge })` where
`skipEdge` drops an edge whose two endpoints both lie on `x = 0`, on `x = W` or on `y = H`, and
`fillMultiplier`/`base` are the polygon's own (`1 + m × 1.2` on `shadowDepth` for the ridge,
`m × 0.9` on `body.shadow` for the ground). Each 45° step and flat run takes the sun like a facet.
The ring is drawn after the polygon in the same static layer (`back` for the ridge, `mid` for the
ground). The `data-terrain` polygon and its `points` string do not change (`TerrainLayer.test.tsx`
pins them).

**Verified against the code:** `getTerrainProfile` always starts at `x = 0` and ends at `x = W`
(`terrainProfile.ts:82`), a run always separates two steps, and the shortest edge is the ground's
20-unit step (28 px long): an 8 px miter inset at its two 135° corners shortens it by about 6.6 px,
so `bevelHolds` holds (§5 proves it over seeds).

### 1.8 Where it lives, and the switches

`src/components/actors/material/`:

- `worldGemMaterial.ts` — the constants (`WORLD_BEVEL_PX` 8, `ROOF_BOX_BEVEL_FACTOR` 0.6,
  `RING_MIN_PX` 1, `RING_FACET_STROKE_PX` 0.6, `HAIRLINE_PX` 1.5, `LIGHT_LATERAL_SPAN` 0.7),
  `worldLightVector`, `worldBevel`, `ringFacets`, `hairline`, and the A/B switches:

  ```ts
  /** Code constants only — no setting, no UI. Each piece is one idle-paint ablation (§5). */
  export const WORLD_GEM = {
    factories: true, massScenery: true, roofBoxes: true, terrain: true, members: true, others: true,
  } as const;
  ```

  A piece that is off renders exactly as today (its ring depth is 0 / its `hairline()` is
  undefined).
- `GemRing.tsx` — the draw-only component.

Reused, not redeclared: `inset`, `edgeNormals`, `bevelDepth` (+ depth param) from `polygon.ts`;
`quantizeShade` from `gemShading.ts`; `facetMultiplier` and `gemOutlineStroke` (newly exported) from
`scenery/gemShape.tsx`; `applyColorShift` and `NO_SHIFT`.

### 1.9 What does not change

Placement, variant selection, silhouettes, ground-lock geometry, work sites and hosts,
`factoryGeometry`, `pipeBridgeLayout`, the robots (`GEM_LIGHT` stays theirs), `GemShape` and its
outline, session storage, content strings (nothing here has a label), the lighting tick cadence,
the scene layer stack. Nothing moves per frame: a ring or hairline is static-layer content that
repaints on the once-a-second lighting tick only.

## 2. Target File Structure

```
src/components/actors/material/
  worldGemMaterial.ts        NEW — constants, WORLD_GEM switches, worldLightVector, worldBevel, ringFacets, hairline
  worldGemMaterial.test.ts   NEW
  GemRing.tsx                NEW — draw-only <g data-gem="ring"> of merged facet paths
  GemRing.test.tsx           NEW
src/components/robot/gem/polygon.ts          edit — bevelDepth(w, h, depth = GEM_BEVEL_DEPTH)
src/components/robot/gem/polygon.test.ts     edit — depth param
src/components/actors/scenery/gemShape.tsx   edit — export facetMultiplier, gemOutlineStroke
src/components/actors/scenery/gemShape.test.tsx  edit
src/components/actors/Factory.tsx            edit — §1.4 (ring, clip margin, belt inset, light in the rooftop ctx)
src/components/actors/Factory.test.tsx       edit
src/components/actors/greebles/greebleTypes.ts        edit — optional `light` on the context
src/components/actors/greebles/rooftopGreebles.tsx    edit — roof-box rings; machinery/waterTower/steppeRoof into ROOFTOP_LAYOUT_PAINT
src/components/actors/greebles/rooftopGreebles.test.tsx  edit
src/components/actors/scenery/renderers/{tank,wall,dome,containers,scaffold,wreck,vent,crane}.tsx  edit — §1.5 rings (+ §1.6 hairlines where listed)
src/components/actors/scenery/renderers/{pylon,beacon,dish,turbine,floodlight,tether,pipeline}.tsx  edit — §1.6 hairlines
src/components/actors/scenery/renderers/*.test.tsx    edit — one ring/hairline case each
src/components/actors/scenery/pipeBridges.tsx         edit — hairline on bar and post
src/components/actors/scenery/pipeBridges.test.tsx    edit
src/components/actors/scenery/sceneryTestHelpers.ts   edit — skip [data-gem="ring"] descendants (assumption 5)
src/components/panels/screen/worldView/TerrainLayer.tsx       edit — §1.7
src/components/panels/screen/worldView/TerrainLayer.test.tsx  edit
src/docs/worldGemMaterialDocs.test.ts   NEW — the docs task's acceptance criteria, executable
docs/BUILDING_DESIGN.md      edit — "Color System" (the material), "Scenery families" (ring/hairline per family), "The 90/45 test helper" (the exemption)
docs/ROBOT_DESIGN.md         edit — "Bevel and shading": the world shares the quantizer and inset; the light rule differs
docs/PERFORMANCE.md          edit — the Phase 44 gate record
docs/todo/roadmap.md         edit — Phase 44 entry: intent/spec/plan/shipped, the three rulings that superseded the idea doc
docs/todo/backlog.md → docs/todo/archive   move — item 9
docs/ideas/world-gem-material.md   edit — superseded header pointing at the intent's three rulings
docs/sketches/gem-factories.html   commit as extended (uncommitted on the branch today)
```

## 3. Implementation Boundaries & Constraints

- **Always:** bevel 0 is byte-identical to today (tested per renderer by snapshot of the
  rendered markup with `WORLD_GEM` off / depth 0); the ring's face is today's fill, untouched; every
  ring goes through `inset` + `edgeNormals` + `quantizeShade` + `facetMultiplier` — no second copy of
  any of them; facets merge per tone up front; strokes and fills are plain attributes — no `style`,
  no CSS transition (roadmap 17.2.5, `Factory.test.tsx`'s transition guard extends to the ring);
  the sketch stays the visual reference, so a change to a constant lands in the sketch first;
  `npm run build:types`, `npm run lint`, `npm test` before every commit.
- **Ask first:** any change to a silhouette, a window, a lamp or placement; faceting a curve; an
  outline stroke on mass; boundary lines on faces; a player-facing switch or any UI; adding a
  rooftop greeble to the ringed set beyond assumption 7; changing the hairline weight (tuned by
  eye, not derived); cutting beyond the order in §5.
- **Never:** a per-frame cost (nothing here may touch a moving layer or a timeline); a ring on a
  member or a curve; the robots' light on a building; a second copy of the 18 % cap, the
  multipliers or the outline colour; display strings in components; anything in Zustand (the
  material is a pure function of geometry and the hour).

## 4. Code Style & Architecture Conventions

The same split as the robots: a pure module computes points and colour strings; a draw-only
component renders them; each renderer composes. A renderer never computes a tone itself:

```tsx
// renderers/wall.tsx (after the two face rects and the inset cap rail)
const d = WORLD_GEM.massScenery ? worldBevel(p.w, p.h) : 0;
const light = worldLightVector(eastL, westL);
const facets = ringFacets(
  rectPoints(x - half, y - p.h, p.w, p.h),
  d,
  light,
  (midX) => (midX < x ? westL : eastL) * cap,
  bodyColor,
  { splitX: x },
);
return (
  <g data-scenery="wall">
    <rect … fill={westFill} />
    <rect … fill={eastFill} />
    <rect x={x - half + d} y={y - p.h + d} width={p.w - 2 * d} height={CAP_RAIL_H} fill={railFill} />
    <GemRing facets={facets} />
  </g>
);
```

```tsx
// renderers/pylon.tsx — a member
<polygon points={towerPoints} fill={steel} {...hairline()} />
```

Constants `UPPER_SNAKE` with a one-line comment naming the sketch value they came from; the
`data-gem="ring"` group is the test and the 90/45 helper's hook; `data-*` on new elements only
where a test needs one.

## 5. Testing & Verification Requirements

- **`worldGemMaterial.test.ts`:** `worldLightVector` is unit length; `[0, −1]` at `eastL === westL`;
  `x > 0` when east is brighter; over the whole `getLighting` cycle `|x| ≤ 1.02` (pins
  `LIGHT_LATERAL_SPAN` to the curve). `worldBevel`: 8 on a 200 × 300 at scale 1, 8 × scale,
  18 % of the short side on a 30-tall item, 0 under `RING_MIN_PX`, 0 for depth 0. `ringFacets`: a
  rect gives 4 facets (6 with `splitX` strictly inside), each outline edge's facet shares its
  endpoints; the facet on a top edge is lit at 9 am and the bottom shaded; both halves of a split
  edge take their own face's light; every quantized shade maps to 0.5 / 1.1 / 1.25 of the face;
  facets with equal (fill, stroke) merge into one path (count paths ≤ distinct pairs); depth 0 →
  `[]`; `skipEdge` drops the frame edges and nothing else; `hairline()` returns the
  `gemOutlineStroke()` colour at 1.5 × scale and `undefined` when `HAIRLINE_PX × scale` is 0.
- **`GemRing.test.tsx`:** renders one `<path>` per facet group inside `g[data-gem="ring"]`, with
  `fill`, `stroke`, `strokeWidth = 0.6 × scale`, `strokeLinejoin="round"`, no `style`; `null` when
  there are no facets.
- **`polygon.test.ts`:** `bevelDepth(w, h)` unchanged for every existing case; the depth param is
  honoured and still capped.
- **`gemShape.test.tsx`:** `facetMultiplier(−1 | 0 | 1)` = 0.5 / 1.1 / 1.25; `gemOutlineStroke()`
  equals the outline the shape draws.
- **`Factory.test.tsx`:** with `WORLD_GEM.factories` off (or depth 0) the rendered markup is
  byte-identical to the pre-change snapshot for every variant; on, exactly one `g[data-gem="ring"]`
  sits after the scaled group and before the rooftop greeble; the ring's top-west and top-east
  facets differ in fill at 9 am and match at noon; the clip rect's `x` is `max(100 d / W, 2)`
  and `y` `max(100 d / H, 2)` (a wide short building and a tall narrow one); belt rects start at
  `100 d / W` and the east one ends at `100 − 100 d / W`; derelict: the ring's fills carry the
  desaturated body; the transition guard finds no `style` on the ring; the item-21 memo spy test
  stays green (the ring is tick-time work, outside the memo); with the ring on, every window
  rect lies inside the clip margin on both axes and the grid's inset from the ring's inner edge is
  equal on the left and right (and top and bottom) within one window slot.
- **`rooftopGreebles.test.tsx`:** crownSpire, waterTower, machinery, steppeRoof and pitchedRoof
  emit a ring when `ctx.light` is set and none when it is undefined; a tier under the floor emits
  none; antennae, pipesValves, the stilts and the antenna rod carry the hairline stroke; cupola has
  one open-arc path with the hairline stroke; `ROOFTOP_LAYOUT_PAINT` has the three new entries and
  each `compute` reads no lighting field.
- **Each scenery renderer test:** one ring case (the family's ringed part has a `g[data-gem="ring"]`
  after it; depth 0 → none; the ring's fill is the face's colour at a known multiplier) or one
  hairline case (each listed element carries `stroke` = `gemOutlineStroke()` and
  `strokeWidth` 1.5; the listed exceptions carry none); the 50-seed `assertNinetyFortyFive` sweep
  stays green with the ring on (assumption 5's skip); `crane.test.tsx` adds "the hanger is a
  `rect`, 3 wide, centred on `hangerX`, from `beamBottom` to `hangerBottomY`".
- **`sceneryTestHelpers.ts`:** the helper still fails a plain 67.5° polygon and passes the same
  polygon inside `g[data-gem="ring"]`.
- **`TerrainLayer.test.tsx`:** the `points` string is unchanged; a `g[data-gem="ring"]` follows the
  polygon; over 200 seeds, for both profiles, `bevelHolds(points, 8)` is true and no facet lies on
  the frame (every facet's outer edge has an endpoint off `x = 0`, `x = W` and `y = H`).
- **`midgroundSilhouettes.test.tsx`:** stays green unchanged (assumption 10).
- **`worldGemMaterialDocs.test.ts`:** BUILDING_DESIGN.md's "Color System" names the ring, the three
  tones and the hairline; "The 90/45 test helper" mentions `data-gem`; ROBOT_DESIGN.md's "Bevel
  and shading" says the world shares `quantizeShade`/`inset` and lights by the hour; the roadmap
  entry no longer says "spec and plan not started"; backlog item 9 is gone from backlog.md.
- **Perf gate (before the docs task), the Districts D2 gate's shape:** production builds of `main`
  and the branch served side by side; one pinned `?session=` world per district — `dense`,
  `ventfield`, `yard`, the coordinates found as the D2 gate did; `npm run perf:idle --throttle 1
  --only none --port 9301`, foreground, one call at a time, orphaned-Chrome count 0 before and
  after, three rounds per world per build, order rotated. **Pass:** idle busy and Paint within the
  build's own round-to-round spread. **Miss:** cut in this order until it holds — hairlines on
  members and the six families (`WORLD_GEM.members`/`.others` off), then terrain
  (`.terrain` off); factories and mass scenery are never cut; a small accepted residual is fine if
  the Pixel feels no worse (the Phase 39 precedent, +6 %). Record the run in PERFORMANCE.md.
- **Checkpoint (Crawford, by eye):** the live 1920 × 1080 world at 9 am, noon, 3 pm and 10 pm: a
  factory still reads as a silhouette with the ring on; a robot still pops against a gem building;
  the ring still reads with lit windows at deep night; the hairline reads on the darkest steel or
  its colour is re-tuned; the window grid sits centred inside the ring (assumption 8); then the
  Pixel.

## 6. Git & Workflow Context

- Branch `feature/world-gem` (at `main` `6802c8b4`). Commit the extended sketch and the intent doc
  first, as they are. One commit per task; the pure module and its tests before any renderer; the
  factory before the scenery; the docs last. PowerShell 5.1: no double quotes inside `-m @'…'@`.
  Roadmap `## 44. World Gem Material (Option A)`.
- TDD per task: failing test first; mutation-check the geometry tests by breaking the cap, the
  multiplier table and the merge and watching them fail; one commit per task; stop and report at the
  perf gate and the checkpoint.

## 7. Open Questions — all resolved (Crawford, 2026-10-08)

1. **Which rooftop greebles are "roof boxes"?** — **Resolved:** most of them. Blocks get the
   ring (crownSpire tiers, waterTower body, machinery stacks, steppeRoof tiers, pitchedRoof's
   slope and wall); really thin parts get the hairline (antennae shaft, pipesValves, stilts, the
   antenna rod); cupola's arc gets the hairline. Assumption 7.
2. **Windows at the ring's inner edge.** — **Resolved:** re-centre the grid inside the ring, as
   the sketch does ("centering is great"). Assumption 8.
3. **The wall's cap rail.** — **Resolved:** move it inside the ring ("match the spirit").
   Assumption 9.
4. **The 90/45 exemption for ring facets.** — **Resolved:** accepted. Assumption 5.
5. **Belt courses on a tank inset by the ring.** — **Resolved:** yes. Assumption 9.
