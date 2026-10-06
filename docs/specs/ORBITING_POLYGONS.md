# Phase Spec: Orbiting Polygons (gem robots, Branch C rewritten)

Roadmap [Phase 40](../todo/roadmap.md#40-orbiting-polygons). Intent:
[docs/intent/orbiting-polygons.md](../intent/orbiting-polygons.md). Builds on shipped Phase 39
([GEM_POLYGON_ROBOTS.md](GEM_POLYGON_ROBOTS.md)); replaces Branch C of
[docs/ideas/gem-polygon-robots.md](../ideas/gem-polygon-robots.md).

**Shipped, redesigned mid-build (2026-10-05).** This spec describes the docking design as it
actually shipped. The original design — drift near the corners, a paired ring orbit through the
body, spawn/despawn by that same ring — passed Gate 1 (the motion sketch) and was fully built, then
missed the Task 13 idle-paint perf gate at +63% busy over the Phase 39 baseline. The cost tracked
the *standing count* of live per-pair orbit-scheduler constructs, not drift or orbit frequency
(both were probed and ruled out). Rather than keep chasing the gate, Crawford cut the whole
orbit/drift mechanism: orbiters now dock at Top's four corners and sit rigid with the body once
attached, animating only on spawn (attach) and a count decrease (detach) — never while resting. See
"Redesign history" (§8) for the full story, and
[docs/intent/orbiting-polygons.md](../intent/orbiting-polygons.md)'s own "Redesign" section for the
interview-stage record of the same turn.

The four orbiters a gem robot already draws come alive on spawn: each flies a short hop into a dock
at Top's corner and stays rigid with the body from then on. A count increase (from the robot's
composition settings) attaches the next one in the seeded order; a count decrease detaches the
last-attached one, in reverse. Every dial comes from the robot's own composition fields; nothing
comes from LFOs, BPM or the audio engine. Robots also stop mirroring on direction change (§7,
unrelated to the motion redesign, shipped alongside it).

## 1. Dials (`src/components/robot/gem/orbiterDials.ts`)

A pure module maps four composition fields to four dials (two timing dials from the original design
— `orbitGap`, `orbitDuration` — and the `octaveRange` input they read are gone; docking has no speed):

```ts
export interface OrbiterDials {
  count: 1 | 2 | 3 | 4;   // rhythmicDensity: <25 → 1, ≤50 → 2, ≤75 → 3, else 4
  size: number;           // 0.75 + 0.5 × motifValue / 8  → 0.75 (0) … 1.0 (4) … 1.25 (8)
  lineWidth: number;      // (3 + varianceValue) / 10        → 0.3 … 1.1   (today's fixed 0.8 sits inside)
  stripOpacity: number;   // 0.35 + 0.65 × pitchRepeat / 100 → 0.35 … 1.0
}
export function orbiterDials(robot: Pick<Robot, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat'>): OrbiterDials;
```

Constants `ORBITER_COUNT_BREAKS = [25, 50, 75]`, `ORBITER_SIZE_MIN/MAX = 0.75/1.25`,
`ORBITER_LINE_BASE = 3`, `ORBITER_STRIP_OPACITY_MIN = 0.35`. Composition fields are read with the
melody defaults (`rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY`, etc. — the same resolution
`regenerateMelody.ts` and `RobotBody` already use); a toggle's `active` flag is ignored, only
`value`. Inputs are clamped to their constant ranges first. Every field undefined: `{ count: 2,
size: 1.25, lineWidth: 0.3, stripOpacity: 0.35 }`.

## 2. Seeded plan and the attach/detach flight (`gem/orbiterMotion.ts`, pure)

```ts
export interface OrbiterPlan {
  cornerOrder: [0, 1, 2, 3] permutation;   // TL/TR/BL/BR indices; n attached orbiters fill the first n
}
export function orbiterPlan(gemSeed: number): OrbiterPlan;   // Map-cached like getRobotGem, seeded
                                                                // from alea(`${gemSeed}:orbit`) — a
                                                                // second stream, so polygon.ts's
                                                                // geometry stream (and gem.fixture.json)
                                                                // is untouched.

export const ATTACH_DROP = 10;          // canvas units the orbiter starts below its dock
export const ATTACH_START_SCALE = 0.4;  // and this fraction of `size` smaller, fading in
export const ATTACH_DURATION = 0.5;     // seconds — a quick "clicks into place" flourish, not a
                                         // journey; fixed, not dial-driven (docking has no speed)

export function gemMotionViewBox(gem: RobotGem): string;
```

`gemMotionViewBox` pads the plain card viewBox (`0 0 width height`) by whatever an orbiter's dock
position can reach beyond the canvas edge: each dock's footprint at `ORBITER_SIZE_MAX` (1.25×,
scaled about the orbiter's own centre — the same point `RobotGem`'s `scale(size)` and
`useOrbiterMotion`'s GSAP scale both use), plus the attach/detach flight's `ATTACH_DROP` on the
bottom side only (GSAP's `x`/`y` are canvas-unit offsets, not scaled by the same tween's own
`scale`). Docks sit at Top's corners, already mostly inside the canvas, so this is usually a small
or zero pad for every real generated robot — unlike the old hoop, the flight never swings wide. (A
code-review fix: the `size` term was missing from an earlier draft of this function; every real
robot's dock sits with enough natural margin that the gap never actually clipped anything, but a
synthetic worst-case input in `orbiterMotion.test.ts` exercises the path directly.)

**Dock geometry (`polygon.ts`).** The four orbiter corners are generated straddling `top`'s own
four corners — `topX ± ORBITER_W/2`, `topY` or `topY + topH − ORBITER_H` — computed from `top`'s
own `x`/`y`/`w` formula (pure k/constant arithmetic, no RNG draw), so the seeded shape-generation
draw order for every other part is untouched. Half the orbiter sits under Top (once drawn in the
new DOM order, §3), the other half pokes out into Mid's margin — "nestled between Top and Mid,"
Crawford's framing at the redesign.

## 3. Renderer changes (`RobotGem.tsx`)

```ts
orbiters: {
  lineWidth: number; stripOpacity: number; size: number;
  /** Static contexts (cards): render the first `count` corners of the seeded order, React scales them. */
  count: 1 | 2 | 3 | 4; cornerOrder: readonly number[];
  /** Animated contexts: emit all four corners, one copy each, no React transform/display. */
  motion: boolean;
}
```

Per orbiter the DOM is one copy, no depth twins — nothing passes in front of or behind the body any
more, so there is nothing to swap:

```
g.gem__orbiter.gem__orbiter--tl                                 ← GSAP: x, y (attach/detach flight), scale, opacity, display
  g.gem__orbiter-local                                             ← GSAP: x, y, scale (size dial); React on cards: scale(size)
    g (transform: translate(part.x part.y))                        ← React: the corner, as today
      path.gem__facets ×tones, polygon.gem__face,
      path.gem__lines   (stroke-width = lineWidth)
      path.gem__strip   (same d, stroke = palette.light, width lineWidth / 3, opacity = stripOpacity, linecap round)
```

Both GSAP groups get `transformOrigin: '50% 50%'` so scale is about the orbiter's own centre. The
strip is drawn in `palette.light`, emissive like the Top lights: no daylight, no battery dim — the
0.35 floor is what keeps it readable at night. **DOM z-order moved**: `backing → mid--left →
mid--right → orbiters → top` (was `backing → orbiters → mid--left → mid--right → top`) — this, not
any geometry trick, is what makes a docked orbiter read as nestled between Mid and Top: Top draws
over the inner half of each one. Cards (`motion` false) emit the first `count` corners of
`cornerOrder` only, `g.gem__orbiter-local` carrying `transform="scale(size)"` — the same seeded
geometry, static. Mids' and Top's line width is `BODY_LINE_WIDTH` (0.8), unchanged by the orbiter
`lineWidth` dial.

## 4. Controller (`gem/useOrbiterMotion.ts`)

```ts
export function useOrbiterMotion(opts: {
  root: RefObject<SVGGElement | null>;    // g.gem — the hook queries .gem__orbiter beneath it
  robotId: string; context: 'world' | 'avatar';
  gem: RobotGem; plan: OrbiterPlan; dials: OrbiterDials; enabled: boolean;
}): void;
```

- **Keys.** Master `orbiters-${context}-${robotId}` (one per rendered instance — the avatar and the
  world show the same robot at once, and `setTimeline` kills a duplicate key) registers a
  lightweight `{ kill: () => {} }` stub, not a real `gsap.timeline()` — nothing is ever added to it
  (no drift to parent, unlike the pre-redesign version), so a genuine timeline would just be a
  standing, never-used GSAP object per robot per context, the exact cost category the Task 13 perf
  investigation flagged. Size-tween key `orbiter-size-${context}-${robotId}`. Per-corner attach/
  detach tweens are tracked in a local (not `timelineMap`-registered) `Map<corner, killFn>`, killed
  on unmount alongside the keys above — a hook-local resource that never outlives its own effect
  doesn't need a globally-addressable key.
- **Mount (`useGSAP`, deps `[gem, enabled, reducedMotion]`).** Initial state via `gsap.set`: every
  copy hidden, local groups at `scale: size`, `x/y: 0`. Then **every initially-shown corner flies
  in at once** (`flyIn(corner, gatesQueue: false)`) — a robot powering up, not a queued sequence.
- **The attach/detach hop (`flyIn`/`flyOut`).** `gsap.to` on the corner's local group: attach starts
  `y: ATTACH_DROP, scale: size × ATTACH_START_SCALE, opacity: 0` and eases (`back.out(1.7)`) to
  `y: 0, scale: size, opacity: 1`; detach is the reverse (`power2.in`), ending hidden. Reduced
  motion: an opacity-only fade (`ORBITER_FADE` 0.3s) in place of either, no x/y/scale movement.
- **Count changes (effect on `dials.count`) — the one-arc-at-a-time queue.** A target-count ref;
  `reconcile()`: **(1)** if an arc is in flight *for the queued path* (`arcInFlightRef`), do
  nothing — its completion calls `reconcile()` again; **(2)** `shown` is an explicit set, never a
  prefix index; **(3)** attach = the *first* corner in `cornerOrder` not shown; detach = the *last*
  shown corner in `cornerOrder`, skipping any corner still busy with its own attach (a `busyCorners`
  set, written at the start of `flyIn`/`flyOut`, cleared on completion — code-review fix: the
  initial-mount batch runs ungated/parallel, so without this a rapid count change right after mount
  could start a detach hop fighting an in-flight attach tween for the same properties; every hop's
  completion now unconditionally retries `reconcile()`, not just the queued ones, so a detach
  deferred because its target was busy gets picked up as soon as that corner settles); **(4)** never
  attach a shown corner or detach a hidden one. One step per call, so a density drag from 1 to 4
  plays three entrances in sequence.
- **Size changes (effect on `dials.size`).** `gsap.to(localGroups, { scale: size, duration: 0.5,
  ease: 'power2.out' })`, keyed `orbiter-size-${context}-${robotId}` so a second drag re-targets
  rather than stacks.
- **Reduced motion** (`matchMedia('(prefers-reduced-motion: reduce)')`, read on mount like
  `BubbleStream`): the fade described above in place of every hop.
- Semantic callbacks only: the hook never reads Zustand inside a tween callback and never touches
  `AudioEngine`, and stays ignorant of job animations (a later phase). `enabled` false (cards)
  returns before creating anything.

## 5. `RobotBody` and the three contexts

`RobotBody` has `motion?: 'world' | 'avatar'` and a `gemRef` it passes to `RobotGem` (`ref` as a
prop, React 19). `composition = useMemo(() => orbiterDials(robot), [the four fields])` — separate
from the audio memo so an envelope edit never recomputes it and vice versa (backlog item 22's
discipline). `plan = orbiterPlan(robot.gemSeed)` is a Map hit outside both. Calls
`useOrbiterMotion({ enabled: motion !== undefined, … })`.

| Context | `motion` | Behaviour |
|---|---|---|
| World (`Robot.tsx`) | `'world'` | Attach/detach on spawn/count-change. Root `<g>` GSAP-owned for position and tilt; no `scaleX` (§7). |
| Detail avatar (`RobotDisplaySection`) | `'avatar'` | Same; viewBox `gemMotionViewBox(gem)` (§2). |
| Selection card (`RobotSelectionCard`) | — | Static resting layout: correct count, size, line width, strip; count edits re-render (no animation). viewBox `gemViewBox(gem)`, unchanged. |

## 6. What does not change

Geometry generation and `gem.fixture.json` (only the four orbiters' x/y shifted, from repositioning
their dock — the RNG draw order is byte-identical); `gemPalette`/shading (the strip reuses
`palette.light`); Mids, Top, backing and their lines; body scale, lights, Mid lit level; spawn,
placement, sessions; the audio engine; content strings (none).

## 7. Flip removal

Shipped alongside the motion redesign, unrelated to it: `Robot.tsx`'s mount `gsap.set` has no
`scaleX`; `swimAnimation.ts`'s `createSwimTimeline(robot, destination, onComplete?)` has no
`targetDirection` parameter, no orientation phase — propulsion starts at position 0 immediately.
`idleSystem.ts`/`robotSystems.ts` still compute and store `Robot.direction` (data — sessions diff
it, spawn reads it) but stop passing it to the swim call.

## 8. Redesign history

**Gate 1 (the motion sketch) passed 2026-10-05** with the original orbit/drift design: one ring
family (the paired corner→centre hoop, no x/y/z axes), orbits 4–8s, drift 6–10s, spawn/despawn by
the same ring with no seeded freedom, a one-arc-at-a-time queue over an explicit shown set. Full
detail is no longer useful as a build reference (the mechanism is gone), but the record matters for
why things are shaped the way they are:

- The ring was one function (`ringPose`) of a corner's rest frame and a hoop angle θ, run by one
  proxy tween per diagonal pair (`[0,3]` and `[1,2]`), `ringPose` evaluated in `onUpdate` and
  written with `gsap.set` — negligible per-frame math. The cost was never the math.
- **Task 13's idle-paint gate missed at +63% busy** over the Phase 39 baseline (JS/scheduler
  overhead, not paint — paint was actually *better*, −9%). A ladder of perf probes, each measured
  clean in the same session: reverting the post-Checkpoint-C orbit-frequency halving bought ~0%;
  capping concurrent active orbits to 2 of 24 pairs bought nothing; consolidating the 24 standing
  per-pair `gsap.delayedCall`/ticker constructs into one shared ticker + a plain `Map` also measured
  flat (median +2% over stock, inside its own noise band). The only variant that moved the needle
  was removing the mechanism entirely (schedulers + drift both off: −28% vs stock, landing at +16%
  vs the Phase 39 baseline) — which is what shipped, pushed further: no scheduler construct at all,
  only an attach/detach hop that exists for 0.5s and then is gone.
- **Conclusion for the record:** the standing *count* of live per-pair scheduling constructs was the
  cost, independent of how often they fired, how many were concurrently active, or what mechanism
  (timer vs. ticker vs. shared pool) held them. "Fewer live GSAP objects" beat every attempt at
  "the same objects, throttled."
- Full numbers: [[orbiting-polygons-task13-perf-gate-miss]], docs/PERFORMANCE.md.

Two open questions from the original interview are resolved by the redesign itself: drift's
always-on-vs-ladder question (§7.2 of the old plan) is moot — there is no drift; arc duration,
behind-dimming and immediate line/strip changes (old §7.3–§7.5) are moot in the same way — there is
no ring to dim behind, and line/strip are still immediate (unchanged).

## 9. Testing & Verification

- **`orbiterDials.test.ts`:** every table boundary; defaults when every field is undefined; clamping
  out-of-range inputs; asserts the dials object has exactly `count`/`size`/`lineWidth`/
  `stripOpacity` — no stray timing field.
- **`orbiterMotion.test.ts`:** `orbiterPlan` deterministic, cached, a fresh-module rebuild matches,
  different seeds differ, never touches `polygon.ts`'s geometry stream (`gem.fixture.json` still
  pins); `cornerOrder` is a permutation of 0–3 over 1,000 seeds; `gemMotionViewBox` contains every
  orbiter at `ORBITER_SIZE_MAX`, never shrinks below the plain card viewBox, needs no pad when
  everything already fits, and (the code-review fix) a synthetic dock flush with the canvas edge
  needs real padding once `ORBITER_SIZE_MAX` is applied.
- **`RobotGem.test.tsx`:** draws in z order backing → mid--left → mid--right → 4 orbiters → top;
  `motion: false` → `count` orbiters in `cornerOrder`, each `scale(size)`; `motion: true` → exactly
  4 copies (one per corner), no `transform`/`display`/`opacity`/`style` on `.gem__orbiter` or
  `.gem__orbiter-local`; the strip path exists per orbiter with `d` equal to the lines path, stroke
  `palette.light`, width `lineWidth / 3`, opacity `stripOpacity`; Mid/Top lines still 0.8.
- **`useOrbiterMotion.test.tsx`:** mount shows exactly `count` corners and hides the rest, each
  shown one flying in from a dropped/shrunk/transparent start to rest; a hidden corner is left at
  rest pose with no hop; master/size-tween keys registered and removed on unmount; two contexts for
  one robot coexist; count-change queue: 2→3 flies in the first unshown corner, 2→4 starts the
  second only after the first completes, 2→4→2 mid-flight settles correctly, 3→2 detaches the last
  shown corner in reverse, the Gate 1 loop case (3→2 then →4 while the detach is mid-flight) settles
  at 4 after exactly two further hops never attaching a shown corner twice; the code-review
  regression test (a count decrease never starts a detach on a corner whose own attach is still in
  flight, mutation-checked); reduced motion → fade only, no hop; size change tweens `scale` over
  0.5s and re-targets rather than stacks.
- **`RobotBody.test.tsx`:** item-22 daylight spy test kept; the composition memo recomputes on a
  density edit and not on an envelope edit; `motion` undefined → `RobotGem` gets `motion: false`.
- **`robotGem.test.ts`:** orbiters are docked at Top's four corners (not the old canvas corners);
  orbiters straddle Top's corners (the design deliberately overlaps now, inverted from the old
  "orbiters sit clear of the body" assertion).
- **Docs tests:** `src/docs/gemPolygonRobotsDocs.test.ts` pins the Visual Mapping guardrail
  (identical in `CLAUDE.md`/`.github/copilot-instructions.md`) and the `ROBOT_DESIGN.md` heading
  list including `Orbiters`.
- **Perf gate — missed, redesign shipped instead of chasing it further.** See §8.
- **Gate (Crawford, by eye) — passed 2026-10-05.** In the world and the detail avatar, orbiters
  click into their docks on spawn, nestled between Mid and Top; a density drag adds/removes them by
  their hop, several edits queue cleanly; cards are static and correct; robots no longer flip.

## 10. Git & Workflow Context

Branch `feature/orbiting-polygons` from `back-to-gen-robots` (Phase 39, unmerged). The motion
redesign landed as one commit (`7963135c`, "Orbiters dock on the hull instead of orbiting") on top
of the already-committed Gate-1-passed orbit/drift implementation and the flip removal — a code
review pass (`code-review-and-quality` skill) ran before that commit and its three findings are
folded into §4's description and were fixed in the same commit, each with a mutation-checked
regression test. Not pushed; no PR yet.
