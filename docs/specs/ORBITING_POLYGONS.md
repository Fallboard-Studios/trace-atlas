# Phase Spec: Orbiting Polygons (gem robots, Branch C rewritten)

Roadmap Phase 40 (proposed). Intent: [docs/intent/orbiting-polygons.md](../intent/orbiting-polygons.md)
(confirmed 2026-10-05, 13 questions). Builds on shipped Phase 39
([GEM_POLYGON_ROBOTS.md](GEM_POLYGON_ROBOTS.md)); replaces Branch C of
[docs/ideas/gem-polygon-robots.md](../ideas/gem-polygon-robots.md). Branch from `back-to-gen-robots`
(Phase 39 tip, unmerged) — see §6.

The four orbiters a gem robot already draws start to move: they drift near their corners, now and
then ride a ring around the body (passing behind it and in front of it), and enter or leave by that
same ring when the robot's **composition settings** change their count. Every dial comes from the
robot's own composition fields; nothing comes from LFOs, BPM or the audio engine. Robots also stop
mirroring on direction change.

## Assumptions (correct these before the plan)

1. **Composition fields are read with the melody defaults.** `rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY`
   (50 → 2 orbiters), `rhythmicMotifLength?.value ?? 8`, `noteVariance?.value ?? 0`,
   `pitchRepeat ?? 0`, octaves from `audioAttributes.octaveRange ?? robot.octaveRange` — the same
   resolution `regenerateMelody.ts` and `RobotBody` already use. A toggle's `active` flag is
   ignored: its `value` is 0 when inactive, which the table already maps.
2. **The intent's "size tween" is the only tweened dial.** Line width and strip opacity update
   immediately on edit (React attributes); count changes animate (§1.5); gap and duration apply to
   the *next* scheduled orbit, never interrupting one in flight.
> **Gate 1 passed 2026-10-05** (motion panel in [docs/sketches/gem-polygon-robots.html](../sketches/gem-polygon-robots.html),
> Task 1). Four things changed from the first draft and are folded in below: (a) the x/y/z axis rings
> are gone — every orbit and arc runs on the orbiter's own corner→centre line, through the body;
> (b) orbits are **paired** — the diagonal partner rides the same hoop π apart, so nothing is ever
> clipped at the far corner; (c) orbits 4–8 s and drift cycles 6–10 s (first draft 2–5 / 3–6 was
> too fast); (d) the spawn/despawn queue runs one arc at a time over an explicit shown set (the
> prefix-indexed draft looped). Assumption 5 and Open Question 1 are superseded by §1.2.

3. **Z-order is done with depth twins, not reparenting.** In an animated context each orbiter is
   emitted three times — a *behind* copy before the backing, the *rest* copy where it is today
   (between backing and Mids), a *front* copy after the Top — and GSAP shows exactly one
   (`display`). A hidden subtree paints nothing, so the element count the Phase 39 perf gate cares
   about stays at one copy per orbiter. Cards emit the rest copy only.
4. **GSAP owns every orbiter transform in animated contexts.** React writes the corner translate on
   an *inner* group and nothing on the two groups GSAP tweens (intent constraint: no React-owned
   transform on anything GSAP moves). On cards, with no GSAP, React writes the size scale itself.
5. ~~The z ring is an ellipse through the corner~~ — **superseded at Gate 1**: there is one ring
   family, the corner→centre hoop of §1.2; no ring ever leaves the canvas by more than half an
   orbiter plus the hoop's openness bulge.
6. **Timing is wall-clock GSAP time** (like `BubbleStream`), seeded per robot from `gemSeed`, never
   the transport. Orbits overlap the swim freely; drift keeps running through orbits and swims.
7. **The perf baseline is the Phase 39 tip** (3-tone gem build, `back-to-gen-robots`), measured in
   the same session as this branch with `npm run perf:idle` on the pinned world — not `main`.
   Drift animates every visible orbiter every frame, so the moving robot layer never idles; this is
   the one real perf risk (§5, §7).
8. **`Robot.direction` stays as data** (robotSystems/spawn read it; sessions diff it). Only its
   rendering goes: the `scaleX` set in `Robot.tsx` and the orientation phase in `swimAnimation.ts`.
   `createSwimTimeline` loses its `targetDirection` parameter.

## 1. Overview & Claude Explanation

### 1.1 Dials (`src/components/robot/gem/orbiterDials.ts`)

A pure module maps the composition fields to the six dials. Outputs were checked against
`constants/index.ts` ranges (density 0–100, motif/variance value 0–8, octave 1–7, pitchRepeat 0–100):

```ts
export interface OrbiterDials {
  count: 1 | 2 | 3 | 4;   // rhythmicDensity: <25 → 1, ≤50 → 2, ≤75 → 3, else 4
  size: number;           // 0.75 + 0.5 × motifValue / 8  → 0.75 (0) … 1.0 (4) … 1.25 (8)
  lineWidth: number;      // (3 + varianceValue) / 10        → 0.3 … 1.1   (today's fixed 0.8 sits inside)
  stripOpacity: number;   // 0.35 + 0.65 × pitchRepeat / 100 → 0.35 … 1.0
  orbitGap: number;       // 7.5 + minOctave  → 8.5 … 14.5 s   (per diagonal pair, §1.2; post-Checkpoint-C correction, was 15 + 2 × minOctave → 17 … 29 s)
  orbitDuration: number;  // 4 + (maxOctave − 1) × 2/3 → 4 … 8 s   (Gate 1: intent's 2–5 s halved, then the slow end brought up 20 %)
}
export function orbiterDials(robot: Pick<Robot, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat' | 'octaveRange' | 'audioAttributes'>): OrbiterDials;
```

Constants `ORBITER_COUNT_BREAKS = [25, 50, 75]`, `ORBITER_SIZE_MIN/MAX = 0.75/1.25`,
`ORBITER_LINE_BASE = 3`, `ORBITER_STRIP_OPACITY_MIN = 0.35`, `ORBIT_GAP_BASE/PER_OCTAVE = 7.5/1`,
`ORBIT_DURATION_BASE/PER_OCTAVE = 4/(2/3)`, each with a comment naming the intent-table row (or the
Gate 1 correction). Inputs are clamped to their constant ranges first. Spawn-default robots: variance
value is seeded at spawn, so most lines land above 0.3; a hand-built fixture with no fields gets 2
orbiters, size 1.25, line 0.3, strip 0.35, gap 9.5 s, duration 4 s.

> **Post-Checkpoint-C correction (Crawford, 2026-10-05):** orbits read too infrequent once seen
> live in the world. `ORBIT_GAP_BASE`/`ORBIT_GAP_PER_OCTAVE` halved from `15`/`2` (17–29 s) to
> `7.5`/`1` (8.5–14.5 s), doubling orbit frequency; `orbitDuration` unchanged. Landed in the Gate 1
> sketch first, per the usual rule.

### 1.2 Seeded motion plan (`gem/orbiterMotion.ts`, pure)

Everything seeded derives from `gemSeed` through a second stream, `alea(`${gemSeed}:orbit`)`, so the
Phase 39 geometry stream is untouched and `gem.fixture.json` still pins:

```ts
export interface OrbiterPlan {
  cornerOrder: [0, 1, 2, 3] permutation;        // TL/TR/BL/BR indices; n orbiters fill the first n
  drift: Array<{ ax: number; ay: number; px: number; py: number; phase: number; phase2: number }>; // per corner
  //  ax, ay ∈ [2, 3] units; px, py ∈ [6, 10] s (one full sine cycle; Gate 1: intent's 3–6 was too fast); phases ∈ [0, 1)
  initialWait: [number, number];                  // per PAIR, ∈ [0, 1) × orbitGap at mount
}
export function orbiterPlan(gemSeed: number): OrbiterPlan;   // Map-cached like getRobotGem

/** The two diagonal pairs — the only orbit unit. Corner i's partner is 3 − i. */
export const ORBIT_PAIRS: readonly [[0, 3], [1, 2]];
export const partnerOf = (corner: number) => 3 - corner;

/** Side, hoop openness and the wait before the pair's next orbit, drawn from the robot's orbit stream. */
export function nextOrbit(R: Rng, dials: OrbiterDials): { dir: 1 | -1; open: number; wait: number };
//  open ∈ [0, ORBIT_OPEN_MAX 0.3];  wait = orbitGap × (1 + R())  → at most one orbit per gap per pair

export interface RingPose { x: number; y: number; scale: number; opacity: number; depth: 'front' | 'rest' | 'behind' }
/** Offset from the corner's rest position at hoop angle θ (0 = at rest). `open` is 0 for arcs. */
export function ringPose(gem: RobotGem, corner: number, dir: 1 | -1, theta: number, open: number): RingPose;
```

**One ring family (Gate 1).** With `K` the corner's rest centre, `C` the canvas centre, `r = |C − K|`,
`û` the unit vector from `K` toward `C` and `v̂` its perpendicular:

| | Rule |
|---|---|
| Offset at θ | `r·(1 − cos θ)·û + open·r·sin θ·v̂` — out along the corner→centre line, through the body, to the far side (`2r·û`, the partner's resting spot when `open = 0`) and back; `open` fattens the edge-on line into the hoop seen at an angle |
| Depth `d = dir·sin θ` | `d > 0`: **front** copy, `scale 1 + 0.15·d`, opacity 1; `d < 0`: **behind** copy, `scale 1 − 0.2·|d|`, opacity `1 − 0.2·|d|`; `d = 0`: rest copy |
| Partner | corner `3 − i` runs the **same θ, same `open`, opposite `dir`** in its own frame — that *is* the point π away on the same hoop. Both reach `C` at θ = π/2 (one behind the backing, one in front of the Top), swap corners at θ = π, and come home. A solo orbit (partner hidden) is the same pose alone; nothing is at the far corner to clip |
| Angle | the line's angle is whatever the canvas gives (`atan2(dy, dx)`: ≈ 49° on a square canvas, ≈ 25° at width factor 2). No tilt band: a tilted line through one corner is not the line through its partner's, so pairs would miss each other |

θ runs 0 → 2π over `orbitDuration` with `sine.inOut` on one proxy tween per pair; `ringPose` is
evaluated in its `onUpdate` for each member and written to the active copy with `gsap.set` (one pair
at a time per robot, every 8.5–14.5 s — negligible per-frame work). The copy swap happens when `depth`
changes (`display: none`/`''` on the three copies). Front peak 1.15× at the centre crossing, behind
trough 0.8× and dimmer; no rotation anywhere.

**Spawn / despawn arcs** are the same function over a quarter of the hoop with **no seeded freedom
at all**: `open = 0`, the exact centre line, drift faded to zero (§1.4), one arc at a time. Despawn:
`dir = −1`, θ: 0 → π/2, then hidden — the orbiter is exactly at the canvas centre behind the backing
when it vanishes. Spawn: `dir = +1`, θ: 3π/2 → 2π, shown at the start — it appears at the centre
behind and plays out to its corner. (The intent says "remaining half-orbit"; on the hoop that is the
last quarter in θ.) Arc duration `orbitDuration / 2` (2–4 s), `sine.inOut`. Any openness or drift
on an arc puts the hide point beside the centre and the orbiter can be seen disappearing — both were
found at Gate 1.

### 1.3 Renderer changes (`RobotGem.tsx`)

New prop block, computed by `RobotBody`, nothing derived inside:

```ts
orbiters: {
  lineWidth: number; stripOpacity: number; size: number;
  /** Static contexts (cards): render the first `count` corners of the seeded order, React scales them. */
  count: 1 | 2 | 3 | 4; cornerOrder: readonly number[];
  /** Animated contexts: emit all four corners × three depth copies with no React transform/display. */
  motion: boolean;
}
```

Per orbiter the DOM becomes:

```
g.gem__orbiter.gem__orbiter--tl[data-depth=behind|rest|front]   ← GSAP: x, y (ring offset), scale (depth), opacity, display
  g.gem__orbiter-local                                             ← GSAP: x, y (drift), scale (size dial); React on cards: scale(size)
    g (transform: translate(part.x part.y))                        ← React: the corner, as today
      path.gem__facets ×tones, polygon.gem__face,
      path.gem__lines   (stroke-width = lineWidth)
      path.gem__strip   (NEW: same d, stroke = palette.light, width lineWidth / 3, opacity = stripOpacity, linecap round)
```

Both GSAP groups get `transformOrigin: '50% 50%'` so scale is about the orbiter's own centre. The
strip is drawn in `palette.light` (`GEM_LIGHT_COLOR`), emissive like the Top lights: no daylight,
no battery dim — the 0.35 floor is what keeps it readable at night. Z slots: `behind` copies are
emitted before the backing, `rest` after it (today's slot), `front` after the Top. Cards (`motion`
false) emit rest copies only, first `count` corners, `g.gem__orbiter-local` carrying
`transform="scale(size)"` — the same seeded geometry, static. `LINE_WIDTH` 0.8 is deleted (the
dial replaces it); the Mids' and Top's line width is unchanged at 0.8 via a `BODY_LINE_WIDTH`
constant.

### 1.4 Controller (`gem/useOrbiterMotion.ts`)

```ts
export function useOrbiterMotion(opts: {
  root: RefObject<SVGGElement | null>;    // g.gem — the hook queries .gem__orbiter[data-depth] beneath it
  robotId: string; context: 'world' | 'avatar';
  gem: RobotGem; plan: OrbiterPlan; dials: OrbiterDials; enabled: boolean;
}): void;
```

- **Keys.** Master `orbiters-${context}-${robotId}` (one per rendered instance — the avatar and the
  world show the same robot at once, and `setTimeline` kills a duplicate key); per corner
  `orbit-${context}-${robotId}-${corner}`. All registered in `timelineMap`, all killed on unmount
  and whenever `gem`/`enabled` change (`useGSAP` with `scope: root`, `revertOnUpdate`).
- **Mount (`useGSAP`, deps `[gem, enabled, reducedMotion]`).** Initial state via `gsap.set`: the
  first `count` corners' rest copies shown, every other copy `display: none`; local groups at
  `scale: size`, `x/y: 0`. Then per shown corner the drift pair (`x: ±ax` and `y: ±ay`, `yoyo`,
  `repeat: -1`, `sine.inOut`, durations `px/2`, `py/2`, started at `progress(phase)`), and **per
  pair with a shown member** an orbit scheduler timeline: wait `initialWait[pair]`, then `nextOrbit`
  → one proxy tween driving both shown members (`ringPose` with opposite `dir`) → on complete, draw
  the next `wait`/`dir`/`open` and rebuild (gap/duration read from a ref at *draw* time, so a dial
  edit affects the next orbit only). If either member is mid-arc when the pair's turn comes, retry
  after `ORBIT_RETRY` 0.5 s. A pair with no shown member has no scheduler.
- **Count changes (effect on `dials.count`).** A target-count ref; `reconcile()` with the Gate 1
  rules: **(1)** if any arc is in flight for this robot, do nothing — its completion calls
  `reconcile()` again (one arc at a time); **(2)** `shown` is an explicit set, never a prefix index;
  **(3)** spawn = the *first* corner in `cornerOrder` that is not shown; despawn = the *last* shown
  corner in `cornerOrder` (last in, first out); **(4)** never spawn a shown corner or despawn a
  hidden one; **(5)** a corner mid-orbit is left to finish — the orbit's completion calls
  `reconcile()`. Spawn: show, arc, then start its drift and (if none) its pair's scheduler. Despawn:
  arc, hide, kill its drift; its pair's scheduler keeps running and goes solo or idles by itself.
  One step per call, so a density drag from 1 to 4 plays three entrances in sequence. *(The first
  draft indexed by position and assumed the shown set was a prefix of the order; a spawn starting
  while another corner was mid-despawn broke that and every completion then re-spawned an
  already-shown corner forever — found at Gate 1.)*
- **Drift fades over arcs.** The drift amplitude is multiplied by `1 − u` over a despawn arc and
  `u` over a spawn arc (`u` = arc progress), so the orbiter is exactly on the centre line, fully
  behind the backing, at the moment it is hidden or shown. Implemented as a tween of a per-corner
  drift-gain proxy that the drift tweens' values are multiplied through (or by pausing drift and
  tweening the local group's `x/y` to 0 in parallel with the arc — plan's choice).
- **Size changes (effect on `dials.size`).** `gsap.to(localGroups, { scale: size, duration: 0.5,
  ease: 'power2.out' })`, keyed `orbiter-size-${context}-${robotId}` so a second drag re-targets
  rather than stacks.
- **Reduced motion** (`matchMedia('(prefers-reduced-motion: reduce)')`, read on mount like
  `BubbleStream`): no drift, no scheduler, no arcs — spawn/despawn is a 0.3 s opacity fade of the
  rest copy at its corner; size still snaps (duration 0, as `getCabinetPopDuration` does).
- Semantic callbacks only: the hook never reads Zustand inside a tween callback and never touches
  `AudioEngine`. `enabled` false (cards) returns before creating anything.

### 1.5 `RobotBody` and the three contexts

`RobotBody` gains `motion?: 'world' | 'avatar'` and a `gemRef` it passes to `RobotGem` (`ref` as a
prop, React 19). New memo `composition = useMemo(() => orbiterDials(robot), [the five fields +
octaveRange + audioAttributes.octaveRange])` — separate from the audio memo so the item-22 daylight
spy test still holds and an envelope edit never recomputes the dials. `plan = orbiterPlan(robot.gemSeed)`
is a Map hit outside both. Calls `useOrbiterMotion({ enabled: motion !== undefined, … })`.

| Context | `motion` | Behaviour |
|---|---|---|
| World (`Robot.tsx`) | `'world'` | Full: drift, orbits, arcs. Root `<g>` still GSAP-owned for position and tilt; **no `scaleX`**. |
| Detail avatar (`RobotDisplaySection`) | `'avatar'` | Full; viewBox `gemMotionViewBox(gem)` (§1.7). |
| Selection card (`RobotSelectionCard`) | — | Static resting layout: correct count, size, line width, strip; count edits re-render (no animation). viewBox unchanged. |

### 1.6 Flip removal

- `Robot.tsx` mount `gsap.set`: drop `scaleX`; keep `x`, `y`, `transformOrigin` (the swim tilt
  rotates about the centre). Doc comment updated (it currently explains the flip).
- `swimAnimation.ts`: delete `ORIENTATION_DURATION`, `PROPULSION_OVERLAP`, the orientation phase and
  `targetDirection`; propulsion starts at 0. `createSwimTimeline(robot, destination, onComplete?)`.
  Callers `idleSystem.ts` and `robotSystems.ts` still compute and store `direction` (data), and
  stop passing it. The flip tests in `swimAnimation.test.ts` become "adds no scaleX tween".

### 1.7 Avatar frame (`gemMotionViewBox`)

`orbiterMotion.ts` adds `gemMotionViewBox(gem)`: the canvas padded by the largest excursion any
orbiter can make — sampled from `ringPose` over θ at `open = ORBIT_OPEN_MAX` for both directions and
all four corners, plus half an orbiter at the 1.15 front scale, plus drift 3 — rounded up to whole
units, symmetric, so the robot stays centred. The hoop itself never leaves the canvas (its far point
is the partner's corner), so the pad is the openness bulge plus the orbiter's own half-size: the
sketch reads ≈ 15 horizontally and ≈ 24 vertically at k = 1.75, body at ≈ 63 % of its former avatar
height. Cards keep `gemViewBox`.

### 1.8 Guardrail rewrite (CLAUDE.md, `.github/copilot-instructions.md`, `Robot.ts`, ROBOT_DESIGN.md)

The shipped sentence ends "No count, side, line or position may change on an audio edit", which
forbids density-driven count. Replace the Visual Mapping line, identically in both instruction
files, with the general form the next (Top/Mid) pass can extend without another rewrite:

> Visual Mapping: "A robot's body is seeded, permanent gem-polygon geometry (derived from `Robot.gemSeed`) in its `identityColor` — identity and seed, not audio. Audio and composition settings reach the body only through the dials listed in ROBOT_DESIGN.md, each continuous or animated, never a pop. The backing, Mids and Top keep their seeded polygon count, sides and boundary-line layout on every edit; orbiters may enter and leave, always by their ring, never popping. Day/night lightness and battery dimming remain the two overlay exceptions."

`Robot.ts`'s `identityColor` comment keeps pointing at ROBOT_DESIGN.md's dial list. ROBOT_DESIGN.md:
"What audio drives" keeps its three dials; a new `## Orbiter motion` section (after it, before
"Non-audio overlays") lists the six composition dials, the ring/arc rules, the twins, the keys and
the card exception; "Render contexts" drops the `scaleX` flip and names `gemMotionViewBox`;
"Forbidden patterns" swaps "position" for "the backing/Mids/Top's layout" and adds "a React-owned
transform on an orbiter group in an animated context". `src/docs/gemPolygonRobotsDocs.test.ts` pins
the old sentence and the exact heading list — both assertions are updated in the same commit, plus
a new `orbitingPolygonsDocs.test.ts` for the roadmap entry and the Shipped/superseded headers.

### 1.9 What does not change

Geometry generation and `gem.fixture.json`; `gemPalette`/shading (the strip reuses `palette.light`);
Mids, Top, backing and their lines; body scale, lights, Mid lit level; spawn, placement, sessions
(every input field is already persisted); the audio engine; content strings (none).

## 2. Target File Structure

```
src/components/robot/gem/
  orbiterDials.ts            NEW — OrbiterDials, orbiterDials(), the constants of §1.1
  orbiterDials.test.ts       NEW
  orbiterMotion.ts           NEW — orbiterPlan (cached), nextOrbit, ringPose, arc ranges, gemMotionViewBox
  orbiterMotion.test.ts      NEW
  useOrbiterMotion.ts        NEW — the GSAP controller of §1.4
  useOrbiterMotion.test.tsx  NEW
  RobotGem.tsx               edit — orbiters prop, strip path, depth twins, nested groups, BODY_LINE_WIDTH
  RobotGem.test.tsx          edit
src/components/robot/
  RobotBody.tsx              edit — motion prop, composition memo, gemRef, hook call
  RobotBody.test.tsx         edit
  Robot.tsx                  edit — no scaleX; passes motion="world"
  Robot.test.tsx             edit
  RobotDisplaySection.tsx    edit — motion="avatar", gemMotionViewBox
  RobotDisplaySection.test.tsx  edit
src/components/selection/RobotSelectionCard.tsx(.test.tsx)   edit — static count/size assertions
src/animation/swimAnimation.ts(.test.ts)   edit — §1.6
src/systems/idleSystem.ts, robotSystems.ts (+tests)   edit — drop the direction argument
src/types/Robot.ts           edit — identityColor comment
src/docs/gemPolygonRobotsDocs.test.ts   edit — new guardrail text, heading list
src/docs/orbitingPolygonsDocs.test.ts   NEW
CLAUDE.md, .github/copilot-instructions.md, docs/ROBOT_DESIGN.md   edit per §1.8
docs/ANIMATION_SYSTEM.md     edit — orbiter keys and the twin/display pattern
docs/PERFORMANCE.md          add — the Phase 40 idle-paint gate
docs/todo/roadmap.md         add — Phase 40
docs/ideas/gem-polygon-robots.md   edit — Branch C superseded by the intent doc
docs/intent/orbiting-polygons.md   edit — Shipped header at the end
```

## 3. Implementation Boundaries & Constraints

- **Always:** every dial continuous or animated; the four orbiter polygons stay the seeded shapes
  (a returning orbiter is the same shape); GSAP is the only writer of `display`/transform on the
  two outer orbiter groups in animated contexts; every timeline in `timelineMap`, killed on unmount;
  seeded choices from `gemSeed` through the `:orbit` stream; `npm run build:types`, `npm run lint`,
  `npm test` before every commit; formula outputs checked against the constants before pinning.
- **Ask first:** changing a table value or threshold (the intent table as corrected at Gate 1 is
  binding); any seeded freedom on an arc (tilt, openness, drift — all zero by Gate 1 finding);
  unpairing orbits; any new composition → visual mapping beyond the six dials; animating the
  64 px cards; a CSS transition in place of a GSAP tween; cutting elements for perf beyond §5's
  ladder; touching the Mid/Top lines or lights (that is the next pass).
- **Never:** BeatClock, Transport, BPM or `AudioEngine` anywhere near this code; timers or
  `requestAnimationFrame`; reading Zustand or calling store actions inside a tween callback;
  reparenting DOM nodes to change z-order; storing a plan, timeline or element in state; a
  display string in a component; a pop (an orbiter appearing or vanishing without its arc or,
  under reduced motion, its fade).

## 4. Code Style & Architecture Conventions

Same split as Phase 39: a pure module computes numbers (`orbiterDials.ts`, `orbiterMotion.ts`),
a hook owns GSAP (`useOrbiterMotion.ts`), `RobotBody` composes, `RobotGem` draws. The ring is a
pure function of angle so it is unit-tested without GSAP:

```ts
/** Offset from the corner's rest position at hoop angle θ; θ = 0 is at rest. Ported from the sketch's ringPose. */
export function ringPose(gem: RobotGem, corner: number, dir: 1 | -1, theta: number, open: number): RingPose {
  const { ux, uy, r } = cornerFrame(gem, corner);          // unit vector corner → canvas centre, and its length
  const along = r * (1 - Math.cos(theta));
  const across = open * r * Math.sin(theta);
  const d = dir * Math.sin(theta);
  return {
    x: along * ux - across * uy,
    y: along * uy + across * ux,
    scale: d >= 0 ? 1 + ORBIT_FRONT_SCALE * d : 1 - ORBIT_BEHIND_SCALE * -d,
    opacity: d >= 0 ? 1 : 1 - ORBIT_BEHIND_DIM * -d,
    depth: Math.abs(d) < 1e-9 ? 'rest' : d > 0 ? 'front' : 'behind',
  };
}
```

Constants `UPPER_SNAKE` with a comment naming the intent row or the Gate 1 verdict
(`ORBIT_FRONT_SCALE = 0.15` "front half ~1.15×", `ORBIT_BEHIND_SCALE = 0.2`, `ORBIT_BEHIND_DIM = 0.2`,
`ORBIT_OPEN_MAX = 0.3`, `ORBIT_RETRY = 0.5`, `DRIFT_AMPLITUDE = [2, 3]`, `DRIFT_PERIOD = [6, 10]`,
`ORBITER_SIZE_TWEEN = 0.5`, `ORBITER_FADE = 0.3`). Class names and `data-depth` as in §1.3 for tests.
Timeline keys as in §1.4. The sketch's motion panel is the reference: a constant change lands there
first.

## 5. Testing & Verification Requirements

- **`orbiterDials.test.ts`:** every table boundary (density 24/25/50/51/75/76; motif 0/4/8;
  variance 0/8; pitchRepeat 0/100; octaves [1,1], [7,7], [2,5]); defaults when every field is
  undefined (2, 1.25, 0.3, 0.35, 19 s, 4 s); duration 4 / 8 at max octave 1 / 7; out-of-range inputs
  clamp; `audioAttributes.octaveRange` wins over `robot.octaveRange`.
- **`orbiterMotion.test.ts`:** `orbiterPlan` deterministic and cached (same reference twice); corner
  order is a permutation; drift (`[2,3]`, periods `[6,10]`)/phase/initialWait within range over
  ≥ 1 000 seeds; `nextOrbit` waits in `[gap, 2·gap)`, `open ∈ [0, 0.3]`, both dirs occur;
  `partnerOf(i) = 3 − i`; `ringPose`: θ = 0 and 2π → offset 0, scale 1, rest, any `open`; θ = π
  with `open 0` → the partner's rest position exactly (`2r·û`); θ = π/2, dir 1 → front, scale 1.15,
  at the canvas centre when `open 0`, offset by `open·r` across the line otherwise; 3π/2 → behind,
  0.8, opacity 0.8; **pair identity**: for every corner, θ and `open`, `ringPose(i, dir, θ, open)`
  and `ringPose(3 − i, −dir, θ, open)` are the same canvas point mirrored through `C` (so both sit
  on one hoop) and at θ = π/2 both are at `C`; despawn arc (`dir −1`, `open 0`, θ 0 → π/2) starts
  at rest and ends `behind` at the canvas centre; spawn arc the reverse; `gemMotionViewBox`
  contains every `ringPose` sample over θ at `open 0.3`, both dirs, all four corners and all five
  width factors (the Phase 39 fixture seeds), plus drift, at scale 1.15. Mutation-checks: break
  `ORBIT_FRONT_SCALE` and the 1.15 test fails; drop the `across` term and the pair-identity test at
  `open 0.3` fails.
- **`RobotGem.test.tsx`:** `motion: false` → `count` orbiters, in `cornerOrder`, each one `[data-depth=rest]`,
  local group `scale(size)`; `motion: true` → 4 × 3 copies, DOM order behind → backing → rest →
  mids → top → front, no `transform`/`display` on `.gem__orbiter` or `.gem__orbiter-local`; the
  strip path exists per orbiter with `d` equal to the lines path, stroke `palette.light`, width
  `lineWidth / 3`, opacity `stripOpacity`; lines width = `lineWidth`; Mid/Top lines still 0.8;
  existing Phase 39 assertions unchanged.
- **`useOrbiterMotion.test.tsx`:** (GSAP in jsdom, spying `gsap.set`/`gsap.to`/`gsap.timeline` as
  `swimAnimation.test.ts` does) mount shows exactly `count` rest copies and hides the rest; keys
  `orbiters-world-r1`, `orbit-world-r1-<pair>` registered and removed on unmount; two contexts
  for one robot coexist; **pairing**: with both members shown one proxy tween drives both, the
  partner's copies swap depth opposite to the lead's, and at the quarter point both displayed
  copies sit at the canvas centre (one `front`, one `behind`); with the partner hidden the lead
  orbits alone; a pair whose member is mid-arc retries after 0.5 s; **queue**: count 2 → 3 starts
  one spawn arc, 2 → 4 starts one then the second only after the first completes (`tl.progress(1)`);
  3 → 2 despawns the last shown corner in order; a despawn requested mid-orbit waits; **the Gate 1
  loop case**: 3 → 2 then → 4 while the despawn is mid-arc settles at 4 with exactly two more arcs
  and never spawns a shown corner (assert on the shown set after every completion); drift
  amplitude is 0 at the end of a despawn arc and at the start of a spawn arc; size change tweens
  `scale` over 0.5 s; gap/duration edits do not kill the running orbit; `enabled: false` creates
  nothing; reduced motion → no drift/scheduler tweens, a 0.3 s opacity tween on count change; no
  callback touches `useLocaleStore`.
- **`RobotBody.test.tsx`:** item-22 daylight spy test kept; the composition memo recomputes on a
  density edit and not on an envelope edit; `motion` undefined → `RobotGem` gets `motion: false`.
- **`Robot.test.tsx` / `swimAnimation.test.ts`:** no `scaleX` in the mount set; no orientation
  tween, propulsion at position 0, duration still distance / 120; callers compile with the new
  signature (`idleSystem.test.ts`, `robotSystems.test.ts`).
- **Avatar/card tests:** avatar viewBox equals `gemMotionViewBox(gem)`; card viewBox unchanged and
  the card draws `count` orbiters at `scale(size)`.
- **Docs tests:** the §1.8 sentence in both instruction files (identical) and absent old sentence;
  ROBOT_DESIGN.md heading list with `Orbiter motion`; the roadmap Phase 40 entry links intent, spec
  and plan; intent doc headed Shipped; idea doc's Branch C headed superseded.
- **Perf gate (before the docs task; stop and report):** `npm run build && npx vite preview --port 4173`
  on the Phase 39 tip and this branch side by side, `npm run perf:idle --throttle 1 --only none`,
  same pinned `?session=`, foreground, one run at a time, orphaned-Chrome count 0, three rounds
  rotated (docs/PERFORMANCE.md, [[perf-harness-measurement-hygiene]]). Pass = busy and paint
  medians within the parent's run-to-run spread (Phase 39's rounds: ~±2 % busy, ~±5 % paint).
  Record the shape count per robot too (expect unchanged + 4 strips). Fail → the ladder, in
  order, each re-measured: (1) drift period floor 4 s / amplitude 2; (2) drift only on the
  selected robot and the avatar; (3) no drift (orbits and arcs only). Crawford picks the rung.
- **Gate (Crawford, by eye):** in the world, orbiters breathe near their corners, a diagonal pair
  rides its hoop now and then and crosses at the body centre (one behind the backing, one in front
  of the Top) with the size and dimming change, a lone orbiter rides alone; a density drag adds and
  removes orbiters by their arcs, several edits queue cleanly and nothing is ever seen vanishing; a Phrase
  Length drag resizes smoothly; Note Variance and Pitch Repeat read on the lines; the avatar shows
  the same motion with nothing clipped; cards are static and correct; robots no longer flip; with
  reduced motion on, only fades. Pixel listen: no new dropouts.

## 6. Git & Workflow Context

- Branch `feature/orbiting-polygons` from `back-to-gen-robots` (Phase 39 is unmerged; PR this after
  it or stack the PRs). One commit per task; the flip removal its own commit; the guardrail +
  docs-test update its own commit; the perf gate a stop-and-report. PowerShell 5.1: no double quotes
  inside `-m @'…'@`; use the Edit tool for TS template literals (bash heredocs eat `\b`).
- TDD per task: failing test first, mutation-check the ring and dial tests by breaking a constant,
  stop at the perf gate and the visual gate. Roadmap `## 40. Orbiting Polygons`.
- **Gate 1 — the motion sketch — passed 2026-10-05** ("happy with the sketch"): the Motion panel
  in `docs/sketches/gem-polygon-robots.html` is the reference for every constant and rule in §1.1,
  §1.2 and §1.4's queue; its header comment logs the verdicts and corrections. Phase 39's rule
  holds: a constant change lands in the sketch first.

## 7. Open Questions

1. ~~Ring shape for the z ring~~ — **resolved at Gate 1**: one ring family, the corner→centre hoop,
   paired (§1.2). The x/y/z axes, the ellipse/circle question and the ±10° tilt band are all gone.
2. **Drift always on** — still open; the perf gate (T13) decides. Accepted at the sketch by eye.
3. **Arc duration** — `orbitDuration / 2` (now 2–4 s) kept at Gate 1; not raised.
4. **Behind dimming 0.8** — kept at Gate 1 (slider default unchanged).
5. **Line width and strip changes immediate** — kept at Gate 1.
6. ~~Motion sketch~~ — done; it found the four changes in the header note above, which is the case
   for keeping it as the reference.
