# Phase Spec: Robot Halo and Lit Boundary Lines (gem robots, the Top/Mid pass)

Roadmap Phase 41 (proposed). Intent: [docs/intent/robot-halo-and-lit-lines.md](../intent/robot-halo-and-lit-lines.md)
(confirmed 2026-10-05, 4 questions). Sketch: [docs/sketches/robot-halo-and-lit-lines.html](../sketches/robot-halo-and-lit-lines.html)
(accepted 2026-10-05; its defaults are every constant below). Builds on shipped Phase 39
([GEM_POLYGON_ROBOTS.md](GEM_POLYGON_ROBOTS.md)) and on Phase 40 ([ORBITING_POLYGONS.md](ORBITING_POLYGONS.md)),
which must be built first — see §6 and the "Phase 40 dependencies" list in Assumption 1.

A gem robot gains four things. A **halo** — one radial-gradient ellipse behind the Mids, coloured by
the robot's company (identity when freelance), sized by its volume, with the envelope drawn along
its radius. **Lit strips** on the Top and Mid boundary lines, whose width follows that layer's
gain-LFO depth. A **flicker**: any strip whose driving attribute changes blinks a few times over the
next two seconds, on its own seeded pattern. A **ripple**: during a Phase 40 spawn arc the halo's
bright ring runs outward repeatedly; during a despawn arc, inward. Nothing comes from BPM, the
transport or the audio engine.

## Assumptions (correct these before the plan)

1. **Phase 40 ships first, unchanged.** This spec consumes, and does not alter: `RobotGem`'s
   `.gem__strip` path and per-part line-width prop (Phase 40 §1.3), `RobotBody`'s composition memo
   and `motion` prop (§1.5), `useOrbiterMotion`'s spawn/despawn arcs and their `reconcile()` queue
   (§1.4), `gemMotionViewBox` (§1.7) and the `BODY_LINE_WIDTH` constant it introduces for Mids/Top
   (this pass replaces that constant with a dial). The branch is cut from Phase 40's tip.
2. **Company colour is read by `RobotBody`, outside the audio memo**, with a narrow selector:
   `useLocaleStore((s) => s.locales[localeId]?.companies.find((c) => c.id === robot.companyId)?.color)`
   and `getActiveLocaleId()` — the same pair `RobotSelectionCard` uses for its company list. It
   re-renders the body only when that one string changes (a company rename does not). The
   item-22 daylight spy test still holds: the halo's inputs are their own memo (§1.5).
3. **Two owners of the halo attributes, never both.** On cards React writes the gradient stops,
   `rx`/`ry` and opacity as attributes. In animated contexts React writes them once at mount and the
   hook owns them from then on (`gsap.to` on `attr`), exactly as Phase 40 splits the orbiter size
   between React (cards) and GSAP (world/avatar). The ripple ellipse and its gradient exist only in
   animated contexts and are GSAP-owned from the first frame (React emits them with opacity 0).
4. **Gradient ids are per rendered instance**: `halo-${context}-${robotId}` and
   `ripple-${context}-${robotId}`, with `context` ∈ `world | avatar | card`. The avatar and the
   world show one robot at once; a duplicated id would silently paint the wrong gradient.
5. **No filter, no blur.** The halo is a single `<ellipse>` with a `<radialGradient>` of six stops;
   the softness comes from the stops. This is the first SVG gradient in `src/` (checked 2026-10-05).
6. **The ripple is a child of the arc timeline**, not a sibling: `useOrbiterMotion` gains an
   optional `decorateArc` callback (§1.4) that `RobotBody` fills from the halo module, so killing or
   finishing the arc kills the ripple with it and the one-arc-at-a-time rule gives at most one
   ripple per robot for free.
7. **Timing is wall-clock GSAP time**, never the transport. Flicker patterns and nothing else are
   seeded; the seed stream is `alea(`${gemSeed}:flicker:${line}:${run}`)` so Phase 39's geometry
   stream and Phase 40's `:orbit` stream are untouched and the fixture still pins.
8. **The perf baseline is Phase 40's tip**, measured in the same session with `npm run perf:idle`
   on the same pinned `?session=`. At rest this pass adds one gradient ellipse per robot and three
   strips, and no per-frame work; the ripple runs only while an arc runs; the flicker only for two
   seconds after an edit. The halo gradient's paint cost on the moving layer is the one real risk (§5).

## Tech stack and commands

React 19, TypeScript 5.9, Zustand 5, GSAP 3 via `@gsap/react`, Vitest + Testing Library.
`npx vitest run <path>` · `npm test` · `npm run build:types` · `npm run lint` · `npm run build` ·
`npm run dev` · `npm run perf:idle --throttle 1 --only none` (after `npm run build && npx vite preview --port 4173`).

## 1. Overview & Claude Explanation

> **Amendment (2026-10-06, Crawford, mid-implementation of Phase 3).** The halo is no longer
> always visible. It appears only while a robot's orbiters are spawning or despawning (the
> Phase 40 attach/detach hop) and is otherwise fully transparent — including on selection cards,
> which never spawn or despawn an orbiter and so never show a halo at all. `RobotGem` renders the
> halo markup (`<defs>` + `ellipse.gem__halo`) only when `orbiters.motion` is true; cards get
> neither the gradient nor the ellipse. In world/avatar, the halo's stops/`rx`/`ry` still tween
> continuously off the envelope/volume dial exactly as §1.1 describes (so it's correct the instant
> it next appears), but its **opacity** is no longer driven by battery dim at rest — it sits at 0
> between arcs and is owned entirely by `decorateArc` (§1.4), which fades it up to the battery-dim
> level and back down to 0 over the arc, keyed to the same envelope that drives the ripple's
> fade-in/fade-out (`rippleEnvelope`), so appearing and disappearing is always a tween, never a
> pop. `HALO_RIPPLE_DIM` (the old "dip to 75%" constant) is removed — there is no longer a visible
> baseline for a ripple to dip from.

### 1.1 Halo dials (`src/components/robot/gem/haloDials.ts`, pure)

```ts
export interface HaloStop { offset: number; opacity: number }   // offset 0..1 of the radius
export interface HaloDials {
  color: string;           // company colour, else identityColor
  radius: number;          // HALO_RADIUS_MIN + (HALO_RADIUS_MAX − MIN) × volume → 20 … 40 units
  stops: HaloStop[];       // exactly six (§ below)
}
export function haloDials(robot: Pick<Robot, 'masterVolume' | 'audioAttributes' | 'identityColor'>, companyColor: string | undefined): HaloDials;
export function haloStops(adsr: ADSREnvelope): HaloStop[];     // peak and hole applied inside
```

Constants, each commented with its intent-table row: `HALO_HOLE = 10` (units, invisible inside),
`HALO_RADIUS_MIN = 20`, `HALO_RADIUS_MAX = 40`, `HALO_PEAK = 0.55`, `HALO_HOLD = 1` (seconds-equivalent;
the envelope has no hold field), `HALO_TWEEN = 0.5`, `HALO_RIPPLE_DIM = 0.25`. Inputs clamped to
their spawn ranges first (volume 0–1; attack/decay/release 0–5; sustain 0–1).

**Stops** — the radius read as time. With `total = attack + decay + HALO_HOLD + release` and
`f(t) = (HALO_HOLE + (radius − HALO_HOLE) × t / total) / radius`:

| # | offset | opacity | reads as |
|---|---|---|---|
| 0 | 0 | 0 | centre |
| 1 | `HALO_HOLE / radius` | 0 | hole edge |
| 2 | `f(attack)` | `HALO_PEAK` | end of attack |
| 3 | `f(attack + decay)` | `HALO_PEAK × sustain` | end of decay |
| 4 | `f(attack + decay + HALO_HOLD)` | `HALO_PEAK × sustain` | end of hold |
| 5 | 1 | 0 | end of release |

An all-zero envelope (total 0) falls back to four equal shares. Coincident offsets (attack 0,
decay 0) are legal in SVG and produce the instant step the envelope would. Offsets are
non-decreasing by construction; the stop *count* never changes, so a tween is stop-to-stop.
The hole offset depends on the radius, so a volume edit moves stop 1 as well as `rx`/`ry`.

**Shape**: `rx = radius × widthFactor`, `ry = radius`, centred on `(gemWidth / 2, GEM_CANVAS_H / 2)`.
At k = 2 the largest halo is rx 80 on a 160-wide canvas, ry 40 on 80 tall — inside the canvas, so
cards clip nothing and `gemMotionViewBox` needs no extra pad.

### 1.2 Body line dials (`gem/bodyLineDials.ts`, pure)

```ts
export interface BodyLineDials { top: number; midLeft: number; midRight: number }   // stroke widths
export function bodyLineDials(lfoLinks: Robot['lfoLinks']): BodyLineDials;
export const BODY_STRIP_OPACITY = 0.6;   // fixed (interview: not lit level, not gain)
```

`BODY_LINE_MIN = 0.3`, `BODY_LINE_MAX = 0.7`, width = `MIN + (MAX − MIN) × depth / 100` of
`lfoLinks['layer0.gain']` (Top), `'layer1.gain'` (Mid left, Coaxial), `'layer2.gain'` (Mid right,
Harmonic). A link whose `lane` is `null`, or a missing `lfoLinks`, reads as depth 0 → 0.3. Depth
clamped to `LFO_DEPTH_MIN..MAX`. The 0.7 ceiling is where a stroke still clears the bevel at the
generator's 0.35 line clearance (half of 0.7) — the generator is not touched. Phase 40's
`BODY_LINE_WIDTH` (0.8) constant is deleted; nothing is 0.8 any more.

### 1.3 Ripple and flicker (`gem/haloRipple.ts`, `gem/stripFlicker.ts`, pure)

```ts
// haloRipple.ts
export const RIPPLE_PERIOD = 2.5;        // s per ring — "the most important thing was keeping the ripple slow"
export const RIPPLE_WIDTH = 0.08;        // of the radius, each side of the ring
export const RIPPLE_OPACITY = 0.9;
export const RIPPLE_DESPAWN_FROM = 0.95; // start of the inward ring (leaves the last 5 % of the base fade visible)
export const RIPPLE_EDGE = 0.1;          // the ring fades in over the arc's first 10 % and out over its last 10 %
export function rippleCycles(arcDuration: number): number;                 // max(1, round(arcDuration / RIPPLE_PERIOD))
export function ripplePosition(kind: 'spawn' | 'despawn', u: number, cycles: number, holeOffset: number): number;
//   spawn: lerp(holeOffset, 1, (u·cycles) mod 1);  despawn: lerp(RIPPLE_DESPAWN_FROM, holeOffset, (u·cycles) mod 1)
export function rippleStops(position: number, holeOffset: number, envelope: number): HaloStop[];   // five stops: 0, lo, position, hi, 1
export function rippleEnvelope(u: number): number;                         // min(1, u / RIPPLE_EDGE, (1 − u) / RIPPLE_EDGE)

// stripFlicker.ts
export const FLICKER_WINDOW = 2, FLICKER_BLINKS: [3, 5], FLICKER_BLINK = 0.1, FLICKER_BLINK_JITTER: [0.7, 1.3], FLICKER_LOW = 0;
export interface Blink { at: number; len: number }
export function flickerPattern(R: Rng): Blink[];          // 3–5 blinks, sorted, all inside [0, FLICKER_WINDOW)
export function flickerGain(pattern: Blink[], t: number): number;   // FLICKER_LOW inside a blink, else 1; 1 after the window
```

**Correction (2026-10-06).** This paragraph described the pre-docking orbit design's 2–4 s arc. The
docking redesign (Phase 40, already shipped before this spec was written) replaced that arc with a
fixed 0.5 s hop (`ATTACH_DURATION`, `orbiterMotion.ts`). `rippleCycles(0.5) = max(1, round(0.5 / 2.5)) = 1`,
so every ripple is one ring sweeping the halo's full radius inside the 0.5 s hop — fast, not the
"slow" ring the intent interview asked for. That tension is a property of the hop's own duration,
not something this spec's maths can fix; `RIPPLE_PERIOD` stays 2.5 s per the intent (a change lands
in the sketch first, per §1 "Ask first"), and the ring's actual speed is confirmed or revisited at
Checkpoint C.

### 1.4 Renderer and controller

**`RobotGem.tsx`** gains:

```ts
halo: { color: string; rx: number; ry: number; stops: HaloStop[]; opacity: number; gradientId: string };
bodyLines: { top: number; midLeft: number; midRight: number; stripOpacity: number };
/** Animated contexts only: emit the ripple ellipse + gradient, GSAP-owned, opacity 0. */
ripple?: { gradientId: string };
```

DOM, in z order (Phase 40's twins kept): behind orbiter copies → backing → **`<defs>` + `ellipse.gem__halo`
+ (motion) `ellipse.gem__ripple`** → rest orbiter copies → Mid left → Mid right → Top → front copies.
The `<defs>` carries `radialGradient#halo-…` (six `<stop>`s, `stop-color` = halo colour, `stop-opacity`
from the dial) and, in motion, `radialGradient#ripple-…` (five stops, all opacity 0 at mount). The
Top and both Mids draw `path.gem__strip` after their `path.gem__lines` exactly as the orbiters do in
Phase 40 (same `d`, `palette.light`, width ⅓ of the line, opacity `bodyLines.stripOpacity`, round caps);
their `.gem__lines` width is the dial. On cards (`motion: false`) React writes every halo attribute
on each render; in motion contexts React writes them at mount only (`defaultValue`-style: the props
are read once in the hook's mount `gsap.set`, and the JSX attributes never change afterwards — a
stable-props wrapper keeps React from rewriting what GSAP owns).

**`gem/useHaloMotion.ts`**:

```ts
export function useHaloMotion(opts: { root: RefObject<SVGGElement | null>; robotId: string; context: 'world' | 'avatar'; halo: HaloDials; dimOpacity: number; enabled: boolean }): { decorateArc: ArcDecorator };
```

- **Keys**: `halo-${context}-${robotId}` for the dial tween (re-targets, never stacks). Registered in
  `timelineMap`, killed on unmount (`useGSAP`, `scope: root`).
- **Mount**: `gsap.set` of the six halo stops (`attr: { offset, 'stop-opacity' }`), `rx`, `ry`, and the
  ellipse opacity to 0 — there is no idle baseline (amendment); `dimOpacity` is read live, from a
  ref, only by `decorateArc` below.
- **Dial change** (effect on `halo`): one `gsap.to` over `HALO_TWEEN` s, `power2.out`, tweening the
  six stops' offsets and opacities, `rx` and `ry` only — opacity is never part of this tween, so the
  halo keeps updating correctly while hidden; duration 0 under reduced motion.
- **`decorateArc(kind, duration, arcTl)`**: builds the ripple on `arcTl` itself — a proxy `{ u: 0 → 1 }`
  tween over `duration` with `ease: 'none'` (the arc's own ease is on θ, the ring is linear in time)
  whose `onUpdate` computes `ripplePosition`/`rippleEnvelope` and `gsap.set`s the five ripple stops,
  the ripple ellipse opacity to `dimOpacity × rippleEnvelope(u)`, and — the halo's only writer of
  opacity anywhere — the halo ellipse opacity to that same `dimOpacity × rippleEnvelope(u)`, fading
  it 0 → `dimOpacity` → 0 across the arc, never an instant set. Nothing is registered separately:
  the arc's key owns it. Skipped under reduced motion (Phase 40 then plays its 0.3 s fade with no
  ripple and no halo).

**`useOrbiterMotion`** (Phase 40) gains the optional `decorateArc?: ArcDecorator` option and calls it
once per spawn/despawn arc, after the arc timeline is built and before it plays. That is the only
change to Phase 40 code.

**`gem/useStripFlicker.ts`**:

```ts
export function useStripFlicker(opts: { root: RefObject<SVGGElement | null>; robotId: string; context: 'world' | 'avatar'; gemSeed: number; triggers: Record<StripLine, unknown[]>; enabled: boolean }): void;
type StripLine = 'top' | 'midLeft' | 'midRight' | 'orbiters';
```

- **Triggers** (from `RobotBody`): `top` ← `[depth0, lane0]`; `midLeft` ← `[depth1, lane1, gain1]`;
  `midRight` ← `[depth2, lane2, gain2]`; `orbiters` ← `[noteVariance.value, pitchRepeat]`. One effect
  per line on its trigger tuple; the first run (mount) never flickers.
- **On change**: draw `flickerPattern` from `alea(`${gemSeed}:flicker:${line}:${run}`)` (`run` is a
  per-line counter so successive edits differ), kill the line's previous timeline, and build one
  timeline keyed `flicker-${context}-${robotId}-${line}`: for each blink, `set opacity FLICKER_LOW`
  at `at`, `set opacity base` at `at + len`, over `FLICKER_WINDOW`; on complete, restore `base`.
  `base` is read from the strip's `data-base` attribute (React writes the dial value there) so a
  strip edited mid-flicker ends at its new value. Targets: every `.gem__strip` under `root` for that
  line (`data-line`), which for `orbiters` is every copy, shown or not. Reduced motion: no timeline.
- A line edited while flickering restarts the two-second window (kill + rebuild) — never stacks.

### 1.5 `RobotBody` and the three contexts

`RobotBody` adds, beside Phase 40's `composition` memo:

- `companyColor` from the store (Assumption 2); `halo = useMemo(() => haloDials(robot, companyColor), [robot.masterVolume, robot.audioAttributes.adsr, robot.identityColor, companyColor])`;
- `bodyLines = useMemo(() => bodyLineDials(robot.lfoLinks), [robot.lfoLinks])` — `lfoLinks` is replaced
  wholesale on edit, so the reference is the dependency;
- `flickerTriggers`, a memo of the four tuples (gains from `audioAttributes.layers`, depth/lane from
  `lfoLinks`);
- `const { decorateArc } = useHaloMotion({ …, enabled: motion !== undefined })`, passed into
  `useOrbiterMotion({ …, decorateArc })`; `useStripFlicker({ …, enabled: motion !== undefined })`.

| Context | Halo | Strips | Flicker | Ripple |
|---|---|---|---|---|
| World (`Robot.tsx`, `motion: 'world'`) | tweened | dial | yes | yes |
| Detail avatar (`motion: 'avatar'`) | tweened | dial | yes | yes |
| Selection card (no `motion`) | React-written, static | dial, static | no | no (no ripple element) |

### 1.6 Guardrail amendment (CLAUDE.md, `.github/copilot-instructions.md`, `Robot.ts`, ROBOT_DESIGN.md)

Phase 40's Visual Mapping sentence already admits new dials through ROBOT_DESIGN.md's list. This
pass changes only its last clause, identically in both instruction files:

> … Day/night lightness, battery dimming and the company colour (halo only) remain the non-audio overlays.

ROBOT_DESIGN.md gains `## Halo and lit lines` after `## Orbiter motion` (the four features, their
dials and constants, the arc decorator, the flicker triggers, the two-owner rule, the card exception);
"Non-audio overlays" gains the company-colour bullet; "Forbidden patterns" lists five non-audio
inputs (identity, seed, daylight, battery, company colour) and adds "an SVG filter on a robot".
`src/docs/gemPolygonRobotsDocs.test.ts`'s heading list and `GUARDRAIL` constant are updated in the
same commit, plus a new `robotHaloDocs.test.ts` for the roadmap entry and Shipped headers.

### 1.7 What does not change

Geometry generation, line clearance and `gem.fixture.json`; `gemPalette`/shading (the strip reuses
`palette.light`; the halo colour bypasses the palette on purpose — it is not a body tone); Phase 40's
orbiter dials, drift, pair orbits, arc timing, queue and `gemMotionViewBox`; the audio engine;
sessions (every input is already persisted); content strings (none).

## 2. Target File Structure

```
src/components/robot/gem/
  haloDials.ts / .test.ts          NEW — HaloDials, haloDials, haloStops, HALO_* constants
  bodyLineDials.ts / .test.ts      NEW — bodyLineDials, BODY_LINE_MIN/MAX, BODY_STRIP_OPACITY
  haloRipple.ts / .test.ts         NEW — rippleCycles, ripplePosition, rippleStops, rippleEnvelope, RIPPLE_*
  stripFlicker.ts / .test.ts       NEW — flickerPattern, flickerGain, FLICKER_*
  useHaloMotion.ts / .test.tsx     NEW — halo tween + decorateArc (ripple)
  useStripFlicker.ts / .test.tsx   NEW — per-line flicker timelines
  useOrbiterMotion.ts / .test.tsx  edit — decorateArc option (Phase 40 file)
  RobotGem.tsx / .test.tsx         edit — halo/ripple elements, body strips, bodyLines prop, BODY_LINE_WIDTH removed
src/components/robot/
  RobotBody.tsx / .test.tsx        edit — company selector, halo/bodyLines/trigger memos, two hook calls
src/components/robot/RobotDisplaySection.test.tsx, src/components/selection/RobotSelectionCard.test.tsx   edit — halo/strip assertions
src/types/Robot.ts                 edit — identityColor comment (company colour on the halo)
src/docs/gemPolygonRobotsDocs.test.ts   edit — guardrail clause, heading list
src/docs/robotHaloDocs.test.ts     NEW
CLAUDE.md, .github/copilot-instructions.md, docs/ROBOT_DESIGN.md   edit per §1.6
docs/ANIMATION_SYSTEM.md           edit — the arc-decorator pattern, halo/flicker keys
docs/PERFORMANCE.md                add — the Phase 41 idle-paint gate
docs/todo/roadmap.md               add — Phase 41
docs/intent/robot-halo-and-lit-lines.md   edit — Shipped header
docs/specs/ORBITING_POLYGONS.md    edit — one line under §7 Q5: the flicker is additive to "immediate"
```

## 3. Implementation Boundaries & Constraints

- **Always:** every dial continuous or tweened, never a pop; one gradient ellipse per robot, no
  filter; GSAP the only writer of halo/ripple/strip-opacity attributes in animated contexts after
  mount; every timeline in `timelineMap`, killed on unmount; seeded choices from `gemSeed` through the
  `:flicker` stream; `npm run build:types`, `npm run lint`, `npm test` before every commit; formula
  outputs checked against the sketch before pinning.
- **Ask first:** changing any constant in §1.1–§1.3 (the sketch defaults are binding — a change lands
  in the sketch first); lengthening Phase 40's arcs; any seeded freedom in the ripple; daylight on the
  halo; a strip-opacity source other than fixed; widening lines past 0.7 (means touching the
  generator's clearance); animating the cards; any further non-audio visual input; a CSS transition
  in place of a GSAP tween; any Phase 40 change beyond the `decorateArc` option.
- **Never:** BeatClock, Transport, BPM or `AudioEngine` near this code; timers or `requestAnimationFrame`;
  reading Zustand or calling store actions inside a tween callback; an SVG `<filter>`; storing a
  timeline, element or dial object in state; a display string in a component; a gradient id shared
  by two instances; a pop.

## 4. Code Style & Architecture Conventions

Same split as Phases 39/40: pure modules compute numbers (`haloDials`, `bodyLineDials`, `haloRipple`,
`stripFlicker`), hooks own GSAP (`useHaloMotion`, `useStripFlicker`), `RobotBody` composes,
`RobotGem` draws. Stops are a pure function of the envelope so they are unit-tested without the DOM:

```ts
/** The envelope laid out along the halo's radius; six stops, offsets non-decreasing. Ported from the sketch's haloStops. */
export function haloStops(adsr: ADSREnvelope, radius: number): HaloStop[] {
  const a = clamp(adsr.attack, 0, ADSR_MAX_SECONDS), d = clamp(adsr.decay, 0, ADSR_MAX_SECONDS);
  const r = clamp(adsr.release, 0, ADSR_MAX_SECONDS), s = clamp(adsr.sustain, 0, 1);
  const total = a + d + HALO_HOLD + r;
  const [ta, td, th] = total > 0 ? [a, a + d, a + d + HALO_HOLD].map((t) => t / total) : [0.25, 0.5, 0.75];
  const hole = HALO_HOLE / radius;
  const f = (t: number) => hole + (1 - hole) * t;
  return [
    { offset: 0, opacity: 0 },
    { offset: hole, opacity: 0 },
    { offset: f(ta), opacity: HALO_PEAK },
    { offset: f(td), opacity: HALO_PEAK * s },
    { offset: f(th), opacity: HALO_PEAK * s },
    { offset: 1, opacity: 0 },
  ];
}
```

Constants `UPPER_SNAKE`, each commented with its intent row or the interview verdict. Class names
`gem__halo`, `gem__ripple`, `gem__strip[data-line][data-base]`; gradient ids and timeline keys as in
§1.4. The sketch is the reference: a constant change lands there first.

## 5. Testing & Verification Requirements

- **`haloDials.test.ts`:** six stops always; offsets non-decreasing; hole offset = 10 / radius;
  attack 0 → stops 1 and 2 share an offset; sustain 1 → stops 2–4 share opacity `HALO_PEAK`;
  sustain 0 → stops 3–4 at 0; all-zero envelope → offsets at 25/50/75 % of the span; radius 20 / 30 / 40
  at volume 0 / 0.5 / 1; out-of-range inputs clamp; `companyColor` wins, `undefined` → `identityColor`.
  Mutation checks: `HALO_PEAK` → 0.5 fails the peak case; dropping `HALO_HOLD` from `total` fails the
  hold case.
- **`bodyLineDials.test.ts`:** depth 0 / 50 / 100 → 0.3 / 0.5 / 0.7; `lane: null` with depth 80 → 0.3;
  missing `lfoLinks` → all 0.3; each line reads its own target id; depth 150 clamps.
- **`haloRipple.test.ts`:** `rippleCycles(2) = 1`, `(3.75) = 2`, `(4) = 2`, `(5) = 2`; `ripplePosition`
  spawn runs `hole → 1` per cycle and restarts, despawn `0.95 → hole`; `rippleEnvelope` 0 at u = 0
  and 1, 1 in the middle; `rippleStops` five stops, ring clamped inside `[hole, 1]`.
- **`stripFlicker.test.ts`:** over ≥ 1 000 seeds patterns have 3–5 sorted blinks inside the window;
  `flickerGain` is `FLICKER_LOW` inside a blink, 1 outside and after the window; two seeds differ;
  `run` 1 vs 2 differ for one seed.
- **`RobotGem.test.tsx`:** halo `<defs>` + `ellipse.gem__halo` sit between the backing and the rest
  orbiter copies; gradient id = `halo-${context}-${robotId}`; six stops with the dial's offsets (as
  percentages, 2 dp) and `stop-color` = halo colour; `rx = radius × k`, `ry = radius`; `motion: false`
  → no `.gem__ripple`; `motion: true` → `.gem__ripple` with opacity 0 and a five-stop gradient;
  Top/Mid `.gem__strip` with `d` === their `.gem__lines` `d`, width `lineWidth / 3`, opacity 0.6,
  `data-line` ∈ top/midLeft/midRight, `data-base` = opacity; Mid/Top `.gem__lines` width = dial;
  no element is 0.8 wide; Phase 39/40 assertions unchanged.
- **`useHaloMotion.test.tsx`** (GSAP in jsdom, spying as `swimAnimation.test.ts` does): mount sets
  the six stops and `rx`/`ry`; a `halo` change creates one tween keyed `halo-world-r1` over 0.5 s and a
  second change re-targets it (one key, one active tween); reduced motion → duration 0; `enabled: false`
  → nothing; `decorateArc('spawn', 3, tl)`: `rippleCycles` honoured, at `tl.progress(0.5)` the ring
  stop sits where `ripplePosition` says, ellipse opacity > 0 mid-arc and 0 at `progress(1)`, the halo
  ellipse at `dimOpacity × 0.75` mid-arc and back at `dimOpacity` after; despawn starts at 0.95;
  unmount kills the key; two contexts for one robot coexist; no callback touches `useLocaleStore`.
- **`useStripFlicker.test.tsx`:** mount → no timeline; `top` trigger change → key
  `flicker-world-r1-top`, only `[data-line=top]` strips set, 3–5 opacity dips inside 2 s, final opacity
  = `data-base`; `midLeft` untouched; a second change inside the window kills and rebuilds (one key);
  `orbiters` change hits every orbiter copy; reduced motion → nothing; `enabled: false` → nothing.
- **`useOrbiterMotion.test.tsx`** (Phase 40 file): `decorateArc` called once per spawn and per despawn
  with the arc's kind, duration and timeline; not called for orbits or reduced-motion fades; absent →
  behaviour unchanged.
- **`RobotBody.test.tsx`:** item-22 daylight spy test kept; the halo memo recomputes on a volume or
  ADSR edit and not on a density edit; the bodyLines memo recomputes on an `lfoLinks` replacement
  and not on an ADSR edit; a company rename does not re-render the body, a company colour change
  does; freelance → identity colour; `motion` undefined → no `.gem__ripple`, no keys.
- **Avatar/card tests:** both draw `.gem__halo` with the robot's radius; the card has no ripple and
  no keys; the avatar registers `halo-avatar-<id>`.
- **Docs tests:** the amended clause in both instruction files (identical); ROBOT_DESIGN.md heading
  list with `Halo and lit lines`; symbols `haloDials`, `haloStops`, `bodyLineDials`, `rippleCycles`,
  `flickerPattern`, `useHaloMotion`, `useStripFlicker` exist in their files; roadmap Phase 41 entry
  links intent, spec, plan and sketch; intent headed Shipped.
- **Perf gate (before the docs task; stop and report):** Phase 40's tip and this branch, production
  builds served side by side, `npm run perf:idle --throttle 1 --only none`, same pinned `?session=`,
  foreground, one run at a time, orphaned-Chrome count 0, three rounds rotated
  (docs/PERFORMANCE.md, [[perf-harness-measurement-hygiene]]). Pass = busy and paint medians within
  the parent's run-to-run spread. Record shapes per robot (expect Phase 40's count + 1 ellipse + 3
  strips; the ripple ellipse at opacity 0 should not paint — verify). Fail → the ladder, in order,
  each re-measured: (1) `rx`/`ry` not tweened (stops only); (2) halo on the selected robot and the
  avatar only; (3) halo as a flat two-stop gradient. Crawford picks the rung.
- **Gate (Crawford, by eye):** the halo is invisible at rest, in every context, including cards; a
  density drag's spawn arc fades the halo up (in the company colour, identity when freelance, with
  the hole/attack/decay/hold/release envelope visible along its radius) while a slow outward ring
  runs, then fades both back to nothing; a despawn arc does the same with an inward ring; a volume
  or envelope edit made before the next arc is reflected correctly when the halo next appears;
  Top/Mid strips read at depth 0 and widen with depth (unaffected by the amendment — always
  visible); an LFO depth edit flickers only that line; the avatar matches; cards show strips but
  never a halo; reduced motion → no flicker, no ripple, halo stays invisible throughout.
  Pixel listen: no new dropouts.

## 6. Git & Workflow Context

- Branch `feature/robot-halo` from Phase 40's tip (`feature/orbiting-polygons` once Tasks 2–16 land;
  stack the PRs: 39 → 40 → 41). One commit per task; the Phase 40 `decorateArc` option its own
  commit; the guardrail + docs-test update its own commit; the perf gate a stop-and-report.
  PowerShell 5.1: no double quotes inside `-m @'…'@`; use the Edit tool for TS template literals.
- TDD per task: failing test first; mutation-check the stop and dial tests by breaking a constant;
  stop at the perf gate and the visual gate. Roadmap `## 41. Robot Halo and Lit Lines`.
- Sketch gate passed 2026-10-05 ("these all look great"); its defaults are the constants above.

## 7. Open Questions

1. **Ripple ellipse at opacity 0 — does it paint?** Phase 40's twins use `display: none` because a
   hidden subtree paints nothing; an opacity-0 ellipse with a gradient fill may still cost a
   rasterization step. The perf gate's shape count answers it; if it paints, switch the ripple to
   `display` toggling at arc start/end (same pattern as the twins).
2. **Ripple on reduced-motion spawn/despawn** — none (the 0.3 s fade plays alone). Confirm at the gate.
3. **Halo while docked / sleeping / critical battery** — battery dim already multiplies it (0.1 at
   critical); docking has no visual today and gets none here. Confirm at the gate.
4. **Strip `data-base` handshake** — React writes the dial value as an attribute and the flicker
   timeline restores from it. If a flicker is mid-flight when React re-renders a new base, the
   element's opacity is overwritten by React until the next blink; accepted (two seconds, visible
   only during a drag). Alternative: the hook owns strip opacity entirely in animated contexts.
   Plan's choice.
