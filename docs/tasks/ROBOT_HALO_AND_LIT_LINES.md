# Implementation Plan: Robot Halo and Lit Boundary Lines

Spec: [docs/specs/ROBOT_HALO_AND_LIT_LINES.md](../specs/ROBOT_HALO_AND_LIT_LINES.md). Intent:
[docs/intent/robot-halo-and-lit-lines.md](../intent/robot-halo-and-lit-lines.md). Sketch:
[docs/sketches/robot-halo-and-lit-lines.html](../sketches/robot-halo-and-lit-lines.html) (accepted
2026-10-05 — its defaults are every constant here). Branch `feature/robot-halo` from Phase 40's tip.
Roadmap Phase 41.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`,
`npm run build`, `npm run dev`, `npm run perf:idle --throttle 1 --only none` (after
`npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Phase 40 prerequisite.** As of 2026-10-05 Phase 40 has Tasks 1–8 committed on
> `feature/orbiting-polygons` (627357a7) and Task 9 in flight; its spawn/despawn arcs (T10), size
> tween (T11), wiring (T12), perf gate (T13) and docs (T14–T16) are not built. Tasks 1–9 below need
> only Phase 40 T5–T7 (strip path, line-width prop, composition memo, `motion` prop) and T8 (the
> hook file). Tasks 10–13 need Phase 40 T10–T12 (arcs and wiring). Branch when Phase 40 T12 is in;
> Phase 1–2 here can be done earlier on a throwaway branch and rebased.

## Overview

Seventeen tasks in five phases. Phase 1 is four pure modules (halo stops, body line widths, ripple
maths, flicker patterns), each unit-tested without GSAP and imported by nothing. Phase 2 puts the
*static* halo and the Top/Mid strips on cards, avatar and world with no timeline in the tree — the
first thing Crawford can see. Phase 3 adds the three animated behaviours in slices (halo tween,
ripple on arcs, flicker) and wires the world and avatar — the visual gate. Phase 4 is the idle-paint
perf gate (stop and report). Phase 5 amends the guardrail and docs. Every task leaves types, lint
and the suite green; RED first; one commit per task; mutation-check each rule test by breaking the
constant it guards.

## Architecture Decisions

- **Pure first, GSAP last.** `haloStops`, `bodyLineDials`, `rippleCycles`/`ripplePosition`,
  `flickerPattern` are functions of numbers; the hooks only feed them to tweens. The GSAP tests in
  T8–T12 check *which* tweens exist, not the maths.
- **Static before motion** (T5–T7). Cards never animate, so the halo shape, colour, radius and the
  strips are fully visible and reviewable before any timeline exists.
- **Two owners, never both** (spec Assumption 3). On cards React writes the halo attributes every
  render; in motion contexts React writes them at mount and the hook owns them after. T9's
  stable-props wrapper is what keeps React from rewriting what GSAP owns.
- **The ripple is designed as a child of the arc** (Assumption 6): a `decorateArc` option on
  whatever hook drives the eventual spawn/despawn arc, so killing the arc kills the ripple. T10 put
  that option on Phase 40's hook and it shipped for one commit; Crawford then reverted it the same
  session (Amendment 2, before Task 8) — the orbiter attach/detach hop isn't a real spawn/despawn
  event, so `useOrbiterMotion` ships with no `decorateArc` option, and the halo is reserved for a
  future job-detach or docking animation's own call site instead.
- **Flicker restores from `data-base`** (spec §7 Q4, plan's choice: accepted as-is). React writes the
  dial value to the strip's `data-base`; the flicker timeline reads it at the end. Simpler than a
  second owner for strip opacity; the drag-mid-flicker overwrite is two seconds and cosmetic.
- **Gradient ids per instance** (Assumption 4): `halo-${context}-${robotId}`, context ∈ world /
  avatar / card.

## Dependency Graph

```
T1 haloDials ─────────┐
T2 bodyLineDials ─────┼─► T5 RobotGem body strips + line dial ─┐
T3 haloRipple ────────┤                                         ├─► T7 RobotBody memos + company selector ─► Checkpoint B
T4 stripFlicker ──────┘   T6 RobotGem halo element (static) ───┘            │
                                                                            ▼
                                                 T8 useHaloMotion: mount + dial tween + reduced motion
                                                                            │
                                                 T9 RobotGem ripple element + stable-props wrapper
                                                                            │
   Phase 40 T10 (arcs) ──► T10 useOrbiterMotion.decorateArc option ◄────────┘
                                                                            │
                                                 T11 useHaloMotion.decorateArc (the ripple) ─► T12 useStripFlicker ─► T13 wire world + avatar
                                                                                                                              │
                                                                   Checkpoint C (visual gate) ─► T14 perf gate (stop) ─► T15 guardrail + docs tests ─► T16 ROBOT_DESIGN/ANIMATION/PERFORMANCE ─► T17 roadmap + headers
```

Parallelisable: T1 ‖ T2 ‖ T3 ‖ T4; T5 ‖ T6 (both edit `RobotGem.tsx` — sequential if one agent);
T12 ‖ T11 (different files). T10 needs Phase 40's arcs to exist.

## Task List

### Phase 1: Pure modules (no importer)

## Task 1: `haloDials.ts`

**Description:** `HaloStop`, `HaloDials`, `haloStops(adsr, radius)`, `haloDials(robot, companyColor)`
and the constants of spec §1.1 (`HALO_HOLE 10`, `HALO_RADIUS_MIN/MAX 20/40`, `HALO_PEAK 0.55`,
`HALO_HOLD 1`, `HALO_TWEEN 0.5`, `HALO_RIPPLE_DIM 0.25`), each commented with its intent-table row.
Inputs clamped to the spawn ranges (volume 0–1; attack/decay/release 0–5; sustain 0–1).

**Acceptance criteria:**
- [ ] Six stops always, offsets non-decreasing, stop 1 at `10 / radius`; attack 0 → stops 1–2 share an
      offset; sustain 1 → stops 2–4 at 0.55; sustain 0 → stops 3–4 at 0; all-zero envelope → offsets at
      25 / 50 / 75 % of the span past the hole.
- [ ] Radius 20 / 30 / 40 at volume 0 / 0.5 / 1; volume 1.5 and −1 clamp; attack 9 clamps to 5.
- [ ] `companyColor` wins; `undefined` → `identityColor`; missing `identityColor` → the same
      `#78cce2` fallback `RobotBody` uses.
- [ ] Mutation checks in the commit message: `HALO_PEAK` → 0.5 fails the peak case; dropping
      `HALO_HOLD` from `total` fails the hold case.

**Verification:** `npx vitest run src/components/robot/gem/haloDials.test.ts`; `npm run build:types`;
`npm run lint`. **Dependencies:** None. **Files:** `gem/haloDials.ts`, `gem/haloDials.test.ts`. **Scope:** S.

## Task 2: `bodyLineDials.ts`

**Description:** `BodyLineDials`, `bodyLineDials(lfoLinks)`, `BODY_LINE_MIN 0.3`, `BODY_LINE_MAX 0.7`,
`BODY_STRIP_OPACITY 0.6`. Width = min + (max − min) × depth / 100 of `layer0.gain` (top),
`layer1.gain` (midLeft), `layer2.gain` (midRight); `lane: null` or a missing link → depth 0.

**Acceptance criteria:**
- [ ] Depth 0 / 50 / 100 → 0.3 / 0.5 / 0.7 on each line, each reading its own target id (a depth on
      `layer1.gain` moves only `midLeft`).
- [ ] `lane: null` with depth 80 → 0.3; `lfoLinks` undefined → all 0.3; depth 150 → 0.7; depth −5 → 0.3.
- [ ] Mutation check: `BODY_LINE_MAX` → 0.8 fails the depth-100 case.

**Verification:** `npx vitest run src/components/robot/gem/bodyLineDials.test.ts`. **Dependencies:** None.
**Files:** `gem/bodyLineDials.ts`, `gem/bodyLineDials.test.ts`. **Scope:** S.

## Task 3: `haloRipple.ts`

**Description:** `RIPPLE_PERIOD 2.5`, `RIPPLE_WIDTH 0.08`, `RIPPLE_OPACITY 0.9`, `RIPPLE_DESPAWN_FROM 0.95`,
`RIPPLE_EDGE 0.1`; `rippleCycles(arcDuration)`, `ripplePosition(kind, u, cycles, holeOffset)`,
`rippleEnvelope(u)`, `rippleStops(position, holeOffset, envelope)` per spec §1.3.

**Acceptance criteria:**
- [ ] `rippleCycles`: 2 → 1, 3 → 1, 3.75 → 2, 4 → 2, 5 → 2, 7.5 → 3.
- [ ] Spawn with 2 cycles: u 0 → hole, u 0.25 → midway, u 0.5 → hole again (restart), u → 1 → 1;
      despawn: u 0 → 0.95, u → 0.5 → hole. `rippleEnvelope`: 0 at u 0 and 1, 1 at u 0.5, 0.5 at u 0.05.
- [ ] `rippleStops`: five stops, `lo ≥ hole`, `hi ≤ 1`, ring opacity = 0.9 × envelope, ends at 0.
- [ ] Mutation check: `RIPPLE_PERIOD` → 2 fails the `rippleCycles(3)` case.

**Verification:** `npx vitest run src/components/robot/gem/haloRipple.test.ts`. **Dependencies:** None.
**Files:** `gem/haloRipple.ts`, `gem/haloRipple.test.ts`. **Scope:** S.

## Task 4: `stripFlicker.ts`

**Description:** `FLICKER_WINDOW 2`, `FLICKER_BLINKS [3, 5]`, `FLICKER_BLINK 0.1`,
`FLICKER_BLINK_JITTER [0.7, 1.3]`, `FLICKER_LOW 0`; `Blink`, `flickerPattern(R)`, `flickerGain(pattern, t)`.
Seed stream convention documented in the file: `alea(`${gemSeed}:flicker:${line}:${run}`)`.

**Acceptance criteria:**
- [ ] Over ≥ 1 000 seeds: 3–5 blinks, sorted by `at`, every `at + len ≤ 2`, `len ∈ [0.07, 0.13]`.
- [ ] `flickerGain` is 0 inside a blink, 1 between blinks, 1 at and after `FLICKER_WINDOW`.
- [ ] Two seeds give different patterns; the same seed is deterministic.

**Verification:** `npx vitest run src/components/robot/gem/stripFlicker.test.ts`. **Dependencies:** None.
**Files:** `gem/stripFlicker.ts`, `gem/stripFlicker.test.ts`. **Scope:** S.

### Checkpoint A: Pure modules
- [ ] T1–T4 green; `npm run build:types`; `npm run lint`; full `npm test` unchanged elsewhere.
- [ ] Nothing imports the four modules yet (`grep -rn "haloDials\|bodyLineDials\|haloRipple\|stripFlicker" src` → tests only).
- [ ] Every constant equals the sketch's current default; if the sketch moved, the spec moves first.

### Phase 2: Static halo and strips visible

## Task 5: `RobotGem` — Top/Mid strips and the line-width dial

**Description:** Add the `bodyLines` prop (`top`, `midLeft`, `midRight`, `stripOpacity`). Phase 40's
`BevelledPart` already takes `lineWidth` and an optional strip; pass the dial widths to the Mids and
Top and give them a strip (`palette.light`, width ⅓, opacity `stripOpacity`, round caps,
`data-line` ∈ top / midLeft / midRight, `data-base` = opacity). Orbiter strips (Phase 40) gain
`data-line="orbiters"` and `data-base` too. Delete `BODY_LINE_WIDTH`. Until T7, `RobotBody` passes
`{ top: 0.8, midLeft: 0.8, midRight: 0.8, stripOpacity: 0 }` so the live app is pixel-identical.

**Acceptance criteria:**
- [ ] Top and each Mid: `.gem__lines` width = its dial; one `.gem__strip` per line path with `d` ===
      the lines' `d`, stroke === `palette.light`, width `lineWidth / 3` (3 dp), opacity ===
      `stripOpacity`, `data-line` and `data-base` set; `stripOpacity: 0` still renders it.
- [ ] Orbiter strips carry `data-line="orbiters"`; `grep BODY_LINE_WIDTH src` → nothing.
- [ ] Every existing `RobotGem.test.tsx` assertion still passes with the temporary prop.

**Verification:** `npx vitest run src/components/robot/gem/RobotGem.test.tsx src/components/robot/RobotBody.test.tsx`.
**Dependencies:** None (Phase 40 T5). **Files:** `gem/RobotGem.tsx`, `gem/RobotGem.test.tsx`, `RobotBody.tsx`. **Scope:** S.

## Task 6: `RobotGem` — the static halo element

**Description:** Add the `halo` prop (`color`, `rx`, `ry`, `stops`, `opacity`, `gradientId`). Emit
`<defs><radialGradient id={gradientId}>` with six `<stop>`s (`offset` as a percentage 2 dp,
`stop-color` = colour, `stop-opacity`) and `ellipse.gem__halo` (`cx`/`cy` at the canvas centre,
`fill="url(#id)"`, `opacity`) **after the backing and before the rest orbiter copies** in both
`motion` modes. No ripple yet. Until T7, `RobotBody` passes a halo with every stop at opacity 0.

**Acceptance criteria:**
- [ ] DOM order: behind copies → backing → defs + `.gem__halo` → rest copies → mids → top → front
      copies (`motion: true`); backing → halo → shown orbiters → mids → top (`motion: false`).
- [ ] Gradient id === `gradientId`; six stops with the given offsets/opacities; `rx`, `ry`, `opacity`
      as given; no `<filter>` anywhere in the output.
- [ ] Two `RobotGem`s rendered with different `gradientId`s produce two gradients, each ellipse
      referencing its own.

**Verification:** `npx vitest run src/components/robot/gem/RobotGem.test.tsx`. **Dependencies:** T5 (same file).
**Files:** `gem/RobotGem.tsx`, `gem/RobotGem.test.tsx`, `RobotBody.tsx`. **Scope:** S.

## Task 7: `RobotBody` — company selector, halo and line memos, static wiring

**Description:** Read `companyColor` with the narrow selector of spec Assumption 2 (`getActiveLocaleId()`
+ `useLocaleStore((s) => s.locales[id]?.companies.find((c) => c.id === robot.companyId)?.color)`).
Add `halo = useMemo(haloDials(robot, companyColor), [masterVolume, audioAttributes.adsr, identityColor, companyColor])`
and `bodyLines = useMemo(bodyLineDials(robot.lfoLinks), [robot.lfoLinks])`, both outside the audio
and composition memos. Pass `halo` (with `gradientId = halo-${motion ?? 'card'}-${robot.id}`,
`opacity = dimOpacity`) and `bodyLines` (with `BODY_STRIP_OPACITY`) to `RobotGem`. Remove T5/T6's
temporary props. No hook yet: in every context React writes the halo each render (the interim
Phase 40 T7 also used).

**Acceptance criteria:**
- [ ] A robot in a company with colour `#ae5378` draws its halo in that colour; `companyId` undefined →
      `identityColor`; volume 0 / 1 → `ry` 20 / 40, `rx` × width factor; an ADSR edit moves the stops.
- [ ] `lfoLinks['layer1.gain'].depth 100` → Mid left lines 0.7, the others 0.3; strips at 0.6.
- [ ] Item-22 spy test kept; an envelope edit recomputes the halo memo but not the composition memo;
      a density edit recomputes neither halo nor bodyLines; a company **rename** does not re-render
      the body (selector returns the same string); a company colour change does.
- [ ] `RobotSelectionCard.test.tsx` / `RobotDisplaySection.test.tsx`: card and avatar draw `.gem__halo`
      with the robot's radius and no `.gem__ripple`; viewBoxes unchanged.

**Verification:** `npx vitest run src/components/robot src/components/selection`; `npm run dev` and
eyeball a card, the avatar and the world. **Dependencies:** T1, T2, T5, T6. **Files:** `RobotBody.tsx`,
`RobotBody.test.tsx`, `RobotSelectionCard.test.tsx`, `RobotDisplaySection.test.tsx`. **Scope:** M.

### Checkpoint B: Static halo and strips live (Crawford, 5 minutes in `npm run dev`)
- [ ] Full suite, types, lint green.
- [ ] Every robot shows a halo in its company colour (identity when freelance) behind the Mids, with
      the hole, rise, step and fade readable on a strong-envelope robot; a volume drag resizes it
      (pop expected here — the tween is T8); a company colour change recolours its robots.
- [ ] Top/Mid strips visible at depth 0 (width 0.3) and wider on linked, deep lanes.
- [ ] Verdict on the peak cap 0.55 against the lit Mids — a change lands in the sketch first.

### Phase 3: Motion

> **Amendment (2026-10-06, Crawford)** — see spec §1 for the full note. The halo is designed to be
> visible only during a spawn/despawn arc; cards never show it. Landed ahead of Task 8 as its own
> commit: `RobotGem` gates the `<defs>`/`ellipse.gem__halo` behind `orbiters.motion`, with the
> RobotGem/RobotBody/RobotSelectionCard/RobotDisplaySection tests updated to match (card tests now
> assert absence; the halo-structure tests moved to a motion context). Tasks 8 and 11 below are
> amended in place: Task 8 no longer tweens the ellipse's own opacity off `dimOpacity` (there is no
> idle baseline to tween to); Task 11's `decorateArc` owns opacity entirely, fading 0 → `dimOpacity`
> → 0 across the arc via `rippleEnvelope`, replacing the old "dip to `dimOpacity × (1 −
> HALO_RIPPLE_DIM)`" behaviour. `HALO_RIPPLE_DIM` is deleted.
>
> **Amendment 2 (2026-10-06, Crawford, after Task 13 — halo left unwired).** Task 10 below
> originally wired `decorateArc` into the Phase 40 orbiter attach/detach hop and shipped that way
> for one commit. Crawford then reversed it: that hop is density-driven (`rhythmicDensity` via
> `orbiterDials().count`), not a real spawn/despawn event, and the halo reads better tied to the
> **job-detach or docking-recharge animation** coming in the next week or two instead. The revert
> (own commit, `3b8a3574`) removed `useOrbiterMotion`'s `decorateArc` option entirely, including the
> paused-`gsap.timeline` wrapping Task 10 had added around each hop's tween solely to call a
> decorator on it before play — with no decorator to call, that wrapping was scaffolding with no
> job, so it came out too (plain `gsap.to` again). **Net result: the halo is currently invisible in
> every context, including world and avatar** — Tasks 1–13 are shipped, tested and correct, but
> nothing in the app calls `decorateArc`, so its opacity never leaves 0. Task 10's description and
> acceptance criteria below are left as written for the historical record of what was built and
> undone; they do not describe the current behaviour of `useOrbiterMotion.ts` (see its own
> 2026-10-06 header comment, and spec §1 Amendment 2, for the shipped state).

## Task 8: `useHaloMotion` — mount state, dial tween, reduced motion

**Description (amended 2026-10-06 — halo opacity is arc-only, see spec §1 amendment):** New hook
per spec §1.4, without `decorateArc` yet: `useGSAP` (scope `root`, deps `[enabled, reducedMotion]`)
that `gsap.set`s the six halo stops and `rx`/`ry` from the `halo` prop at mount, and sets the
ellipse opacity to 0 (there is no idle baseline — Task 11's `decorateArc` is the only thing that
ever makes it non-zero); an effect on `[halo]` (skipping mount) that `gsap.to`s the stops/`rx`/`ry`
over `HALO_TWEEN` (`power2.out`, duration 0 under `prefersReducedMotion()`), keyed
`halo-${context}-${robotId}` in `timelineMap`, re-targeting on a second change — this tween never
touches opacity, so the dial keeps updating while hidden and is correct the next time it appears.
`dimOpacity` is stored in a ref (read live by Task 11's `decorateArc`, same pattern as
`useOrbiterMotion`'s `dialsRef`), not tweened here. `enabled: false` → nothing. Returns
`{ decorateArc }` as a no-op for now.

**Acceptance criteria:**
- [ ] Mount: one `gsap.set` for the six stops + `rx`/`ry`, and one `gsap.set` of the ellipse
      opacity to 0; `timelineMap` has no key until a `halo` change.
- [ ] A `halo` change → one tween, key `halo-world-r1`, duration 0.5, targets the six stops' `offset`
      and `stop-opacity`, `rx`, `ry` only (never opacity); a second change mid-tween replaces it (one
      key, one active tween).
- [ ] A `dimOpacity` change alone touches no `gsap.*` call (it only updates the ref Task 11 reads).
- [ ] Reduced motion → duration 0; `enabled: false` → no `gsap.*` calls; unmount kills the key;
      world and avatar for one id coexist.

**Verification:** `npx vitest run src/components/robot/gem/useHaloMotion.test.tsx`. **Dependencies:** T1, T7.
**Files:** `gem/useHaloMotion.ts`, `gem/useHaloMotion.test.tsx`. **Scope:** S.

## Task 9: `RobotGem` — ripple element and the stable-props wrapper

**Description:** Add the optional `ripple: { gradientId }` prop: in `motion: true` only, emit
`radialGradient#ripple-…` (five stops, opacity 0) and `ellipse.gem__ripple` (opacity 0) directly
after `.gem__halo`. Add a `HaloLayer` memo component that receives the halo/ripple props and, when
`motion` is true, freezes them after the first render (a ref of the mount-time props; re-renders
reuse it), so React never rewrites what the hook owns. In `motion: false` it re-renders normally.

**Acceptance criteria:**
- [ ] `motion: true` → `.gem__ripple` with opacity 0, five-stop gradient id === `ripple.gradientId`;
      `motion: false` → absent even if `ripple` is passed.
- [ ] `motion: true`: re-rendering with a different `halo.rx` leaves the DOM attribute unchanged;
      `motion: false`: the attribute updates.
- [ ] T5/T6 assertions hold.

**Verification:** `npx vitest run src/components/robot/gem/RobotGem.test.tsx`. **Dependencies:** T6.
**Files:** `gem/RobotGem.tsx`, `gem/RobotGem.test.tsx`. **Scope:** S.

## Task 10: Phase 40 — `decorateArc` option on `useOrbiterMotion` (its own commit)

> **Reverted (2026-10-06, same session — see Amendment 2 above).** This task shipped, then was
> undone a few commits later: `useOrbiterMotion.ts` has no `decorateArc` option today, and nothing
> calls it. Kept below only as a record of what was built and why it came back out.

**Description (corrected 2026-10-06 — "arc" is Phase 40's docking hop, not the pre-docking orbit
arc the original wording assumed):** `useOrbiterMotion` has no `arcTl` to hand over today — each
attach/detach hop is a single bare `gsap.to`, not a timeline, so `flyIn`/`flyOut` must each build a
`gsap.timeline()` wrapping that hop tween, call `decorateArc` on it before the timeline plays, and
keep every existing `onComplete` bookkeeping (busyCorners/arcKillers/reconcile) working off the
wrapping timeline instead of the bare tween. Add `decorateArc?: (kind: 'spawn' | 'despawn', duration: number, arcTl: gsap.core.Timeline) => void`
to `UseOrbiterMotionOptions`, called once per hop after its timeline is built and before it plays
(not for reduced-motion fades, which stay bare tweens — Task 9's spec §7 Q2 answer is "none" there
anyway). Export the `ArcDecorator` type (from `useHaloMotion.ts`, which already defines it for
Task 8's return value — `useOrbiterMotion` imports it rather than redefining it). Nothing else in
the file changes.

**Acceptance criteria:**
- [ ] Count 2 → 3: `decorateArc` called once with `('spawn', ATTACH_DURATION, tl)` where `tl` is the
      hop's own wrapping timeline (not Phase 40's old `orbitDuration / 2` — there is no orbit any
      more); 3 → 2: once with `'despawn'`; reduced motion: never.
- [ ] Omitted → every existing `useOrbiterMotion` test passes unchanged.

**Verification:** `npx vitest run src/components/robot/gem/useOrbiterMotion.test.tsx`.
**Dependencies:** Phase 40 T10 built. **Files:** `gem/useOrbiterMotion.ts`, `gem/useOrbiterMotion.test.tsx`. **Scope:** S.

## Task 11: `useHaloMotion.decorateArc` — the ripple, and the halo's only moment of visibility

**Description (amended 2026-10-06 — see spec §1 amendment):** Implement `decorateArc(kind,
duration, arcTl)` per spec §1.4: a proxy `{ u: 0 → 1 }` tween on `arcTl`, at position 0, over
`duration`, `ease: 'none'`, whose `onUpdate` sets the five ripple stops from
`ripplePosition(kind, u, rippleCycles(duration), holeOffset)` and `rippleEnvelope(u)`, sets the
ripple ellipse opacity to `dimOpacity × rippleEnvelope(u)`, and — this is the halo's only writer of
opacity anywhere — sets the halo ellipse opacity to that same `dimOpacity × rippleEnvelope(u)`, so
the halo fades 0 → `dimOpacity` → 0 across the arc in lockstep with the ripple, never an instant
set (a pop would violate the "never a pop" guardrail now that there's no visible baseline to dip
from). `holeOffset` and `dimOpacity` come from refs updated every render. Nothing is registered
separately. Under reduced motion `decorateArc` is a no-op (the halo stays invisible; Phase 40's own
0.3 s fade plays alone, per spec §7 Q2).

**Acceptance criteria:**
- [ ] `decorateArc('spawn', 3, tl)`: at `tl.progress(0.5)` the ring stop's offset equals
      `ripplePosition('spawn', 0.5, 1, hole)` (2 dp); both the ripple and halo ellipse opacities equal
      `dimOpacity × rippleEnvelope(0.5)` (> 0); at `progress(0)` and `progress(1)` both are 0.
- [ ] `'despawn'` at `progress(0)` → ring at 0.95; `decorateArc('spawn', 5, tl)` restarts the ring at
      `progress(0.5)` (two cycles).
- [ ] Killing `tl` leaves no tween alive (`gsap.getTweensOf` the ripple stops → empty); reduced motion →
      `tl` gains no children (halo opacity stays 0 throughout); no callback touches `useLocaleStore`.
- [ ] Mutation check: dropping `rippleEnvelope` fails the "opacity 0 at progress 0/1" case for *both*
      the ripple and the halo ellipse.

**Verification:** `npx vitest run src/components/robot/gem/useHaloMotion.test.tsx`. **Dependencies:** T3, T8, T9, T10.
**Files:** `gem/useHaloMotion.ts`, `gem/useHaloMotion.test.tsx`. **Scope:** S.

## Task 12: `useStripFlicker`

**Description:** New hook per spec §1.4: for each `StripLine` an effect on its trigger tuple (skipping
mount) that draws `flickerPattern` from `alea(`${gemSeed}:flicker:${line}:${run}`)` (per-line run
counter), kills the line's previous timeline, and builds one keyed `flicker-${context}-${robotId}-${line}`:
per blink a `set` of `opacity` to `FLICKER_LOW` at `at` and back to each target's `data-base` at
`at + len`; on complete restore `data-base`. Targets: every `.gem__strip[data-line=line]` under
`root`. Reduced motion or `enabled: false` → nothing. All keys killed on unmount.

**Acceptance criteria:**
- [ ] Mount → no key; `top` tuple change → `flicker-world-r1-top`, only `[data-line=top]` strips
      touched, 3–5 dips to 0 inside 2 s (`tl.time()` stepping), final opacity === `data-base`.
- [ ] `midLeft` strips untouched by a `top` change; `orbiters` change hits every orbiter copy.
- [ ] A second `top` change inside the window kills and rebuilds (one key, `run` advanced, a different
      pattern); reduced motion → nothing; `enabled: false` → nothing; unmount kills all keys.

**Verification:** `npx vitest run src/components/robot/gem/useStripFlicker.test.tsx`. **Dependencies:** T4, T5.
**Files:** `gem/useStripFlicker.ts`, `gem/useStripFlicker.test.tsx`. **Scope:** S.

## Task 13: Wire the world and the avatar

> **Amended (2026-10-06, same session — see Amendment 2 above).** `decorateArc` is *not* passed
> into `useOrbiterMotion` — that wiring shipped in Task 10, then was reverted. `RobotBody` still
> destructures `decorateArc` from `useHaloMotion`'s return value but hands it nowhere; it has no
> current caller. The integration criterion below (a spawn arc's timeline carrying the ripple proxy
> tween) described the Task-10-wired behaviour and no longer holds — there is no such tween to find
> today. Kept as written for the historical record.

**Description:** `RobotBody`: `flickerTriggers` memo (`top ← [depth0, lane0]`, `midLeft ← [depth1, lane1, gain1]`,
`midRight ← [depth2, lane2, gain2]`, `orbiters ← [noteVariance.value, pitchRepeat]`);
`const { decorateArc } = useHaloMotion({ root: gemRef, robotId, context: motion, halo, dimOpacity, enabled: motion !== undefined })`;
pass `decorateArc` into `useOrbiterMotion`; `useStripFlicker({ root: gemRef, robotId, context: motion, gemSeed, triggers, enabled: motion !== undefined })`;
pass `ripple: { gradientId: ripple-${motion}-${robot.id} }` to `RobotGem` when `motion` is set.
`Robot.tsx` and `RobotDisplaySection` already pass `motion` (Phase 40 T12); cards unchanged.

**Acceptance criteria:**
- [ ] `RobotBody` with `motion="world"`: a volume edit registers `halo-world-<id>`; a depth edit
      registers `flicker-world-<id>-top`; without `motion`: no keys, no `.gem__ripple`.
- [ ] ~~Integration: `<Robot>` with the real body, count 2 → 3 → one spawn arc whose timeline
      carries the ripple proxy tween (spy on `decorateArc` or inspect `tl.getChildren()`).~~
      Superseded — no longer true as of the amendment above; there is no such caller.
- [ ] `RobotDisplaySection.test.tsx`: `.gem__ripple` present in the avatar; card test: absent.
- [ ] `npm run build` clean.

**Verification:** `npx vitest run src/components/robot src/components/selection`; `npm run build`.
**Dependencies:** T11, T12. **Files:** `RobotBody.tsx`, `RobotBody.test.tsx`, `RobotDisplaySection.test.tsx`, `Robot.test.tsx`. **Scope:** M.

### Checkpoint C: Visual gate (Crawford, spec §5 "Gate") — stop and report
- [ ] Full suite, types, lint, build green.
- [ ] **As actually shipped (Amendment 2 above):** halo is invisible everywhere — world and avatar
      too, not just cards — because nothing calls `decorateArc`. There is no density drag or any
      other current action that shows it. What to verify now: an LFO depth edit flickers only that
      line, out of step across lines; Note Variance / Pitch Repeat flicker the orbiter strips;
      strips read at depth 0 and widen with depth, identically in world/avatar/cards; reduced
      motion → no flicker (nothing to reduce on the halo side — it's already invisible).
- [ ] **Deferred:** the halo/ripple half of this gate (spawn arc fades the halo up with an outward
      ring, despawn the same inward, a dial edit mid-hide showing correctly next time it appears) —
      re-run once a future task wires `decorateArc` into the job-detach or docking animation.
- [ ] Verdicts on spec §7 Q2–Q3 (reduced-motion ripple: none, halo stays hidden; docked/critical:
      no change — a hidden halo has no battery-dim distinction to show until it next appears).

### Phase 4: Perf gate

## Task 14: Idle-paint perf gate (stop and report; spec §5, §7 Q1)

**Description:** Production builds of Phase 40's tip and this branch served side by side;
`npm run perf:idle --throttle 1 --only none` on the same pinned `?session=`, foreground, one run at a
time, orphaned-Chrome count 0 before, three rounds rotated ([[perf-harness-measurement-hygiene]],
docs/PERFORMANCE.md). Record busy, paint, layout, compositor and drawn shapes per robot. Pass =
busy and paint medians within the parent's run-to-run spread. The shape count answers Q1: expect
Phase 40's count + 1 ellipse + 3 strips; if the opacity-0 ripple ellipse is counted, switch it to
`display` toggling at arc start/end (own commit, re-measure). On a miss, throwaway variants for the
ladder: (1) `rx`/`ry` not tweened, (2) halo on the selected robot and avatar only, (3) flat two-stop
gradient. Crawford picks the rung.

**Acceptance criteria:**
- [ ] A results table (both builds, three rounds each, plus any variants) and the method line
      written up for docs/PERFORMANCE.md (landed in T16).
- [ ] Shapes per robot explained (Q1 answered in the table's notes).
- [ ] Either pass, or a chosen rung implemented as its own commit with the gate re-run and green.

**Verification:** the table. **Dependencies:** T13. **Files:** none (or the rung's edit + tests). **Scope:** S–M.

### Phase 5: Guardrail and docs

## Task 15: Guardrail clause + docs tests

**Description:** Replace the Visual Mapping sentence's last clause in `CLAUDE.md` and
`.github/copilot-instructions.md` with spec §1.6's (identical in both); update `Robot.ts`'s
`identityColor` comment (company colour reaches the halo only). `gemPolygonRobotsDocs.test.ts`: the
`GUARDRAIL` constant, and the heading list gains `Halo and lit lines` after `Orbiter motion` (land
T15 and T16 back to back — the heading case is red until T16). Add `src/docs/robotHaloDocs.test.ts`
RED: roadmap Phase 41 entry links intent/spec/plan/sketch; intent headed Shipped; ROBOT_DESIGN.md
names `haloDials`, `haloStops`, `bodyLineDials`, `rippleCycles`, `flickerPattern`, `useHaloMotion`,
`useStripFlicker`, each existing in its file; Phase 40 spec §7 Q5 carries the flicker line.

**Acceptance criteria:**
- [ ] Both instruction files carry the new clause, byte-identical; the old "Day/night lightness and
      battery dimming remain the two overlay exceptions" wording is absent from both and from `Robot.ts`.
- [ ] `gemPolygonRobotsDocs.test.ts` green except the heading-list case; `robotHaloDocs.test.ts` RED.

**Verification:** `npx vitest run src/docs`. **Dependencies:** T14. **Files:** `CLAUDE.md`,
`.github/copilot-instructions.md`, `src/types/Robot.ts`, `src/docs/gemPolygonRobotsDocs.test.ts`, `src/docs/robotHaloDocs.test.ts`. **Scope:** S.

## Task 16: ROBOT_DESIGN.md, ANIMATION_SYSTEM.md, PERFORMANCE.md

**Description:** ROBOT_DESIGN.md: new `## Halo and lit lines` after `## Orbiter motion` (the four
features, dials, constants, the two-owner rule, the arc decorator, flicker triggers, keys, the card
exception); "Non-audio overlays" gains the company-colour bullet; "Forbidden patterns" lists the
five non-audio inputs and adds "an SVG filter on a robot"; "Data flow" gains the halo/bodyLines
memos and the company selector. ANIMATION_SYSTEM.md: the arc-decorator pattern (a child timeline
sharing its parent's key) and the halo/flicker key families. PERFORMANCE.md: the Phase 41 gate
section from T14.

**Acceptance criteria:**
- [ ] `gemPolygonRobotsDocs.test.ts` fully green; every symbol named in ROBOT_DESIGN.md exists.
- [ ] PERFORMANCE.md's new section has the method line and the T14 table.

**Verification:** `npx vitest run src/docs`. **Dependencies:** T15. **Files:** `docs/ROBOT_DESIGN.md`,
`docs/ANIMATION_SYSTEM.md`, `docs/PERFORMANCE.md`, `src/docs/gemPolygonRobotsDocs.test.ts`. **Scope:** S.

## Task 17: Roadmap, Shipped headers, Phase 40 spec note

**Description:** `docs/todo/roadmap.md` `## 41. Robot Halo and Lit Lines` (About / decisions made
while building / Not Doing — Top/Mid drift, bevel from phase, card animation, the item-4 inventory),
linking intent, spec, plan and sketch. Headers: intent "Shipped (roadmap Phase 41, <date>)"; this
spec "Shipped" plus inline as-built deviations; this plan's status notes per task; sketch header
verdict lines filled. `docs/specs/ORBITING_POLYGONS.md` §7 Q5: one line that the strip flicker
(Phase 41) is additive to "immediate". Phase 40's roadmap "Not Doing — the Top/Mid pass" bullet
points here.

**Acceptance criteria:**
- [ ] `robotHaloDocs.test.ts` green; full `npm test`, `build:types`, `lint`, `build` green.
- [ ] Every open question in spec §7 has a recorded answer (or "deferred to <where>").

**Verification:** `npm test`; `npm run build`. **Dependencies:** T16. **Files:** `docs/todo/roadmap.md`,
`docs/intent/robot-halo-and-lit-lines.md`, `docs/specs/ROBOT_HALO_AND_LIT_LINES.md`,
`docs/tasks/ROBOT_HALO_AND_LIT_LINES.md`, `docs/specs/ORBITING_POLYGONS.md`, `docs/sketches/robot-halo-and-lit-lines.html`. **Scope:** S.

### Checkpoint D: Complete
- [ ] All acceptance criteria met; suite/types/lint/build green; perf gate recorded.
- [ ] Crawford's final review; Pixel listen (no new dropouts); push; PR stacked on Phase 40's.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The halo gradient re-rasterizes with the moving robot layer every frame it moves (12 robots) | High — the gate's paint number | T14's ladder; T8 isolates the tween so rung 1 is a one-line change; rung 3 keeps the feature at a flat gradient |
| An opacity-0 ripple ellipse still paints (spec §7 Q1) | Med — gate numbers | T14 counts shapes; fallback is `display` toggling in T11's start/end sets, same pattern as Phase 40's twins |
| React rewrites GSAP-owned halo attributes on a re-render (two owners) | Med — a visible snap mid-tween | T9's stable-props wrapper + a test that a prop change leaves the DOM attribute alone in motion mode |
| Gradient id collision between the avatar and the world (same robot) | Med — wrong colour/shape, silently | Per-instance ids (T6/T7 tests render two instances) |
| Tweening six stops' `offset` as percentage strings | Low — GSAP parses `"12.34%"` fine, but the unit must be stable | T8 asserts the written value keeps its `%` |
| `data-base` overwritten mid-flicker by a React re-render (spec §7 Q4) | Low — cosmetic, two seconds during a drag | Accepted; T12 asserts the final restore reads `data-base`, so the end state is always right |
| Docs test heading list red between T15 and T16 | Low | Land back to back; never leave the branch there overnight |
| Phase 40 moves under this plan (its T9–T16 are still in flight) | Med — T10/T13 assumptions drift | Branch only after Phase 40 T12; re-read `useOrbiterMotion.ts` before T10 and update this plan's status notes |

## Open Questions (spec §7)

1. Opacity-0 ripple paint cost — T14 decides (`display` fallback ready in T11).
2. Reduced-motion spawn/despawn without a ripple — confirm at Checkpoint C.
3. Docked / critical battery — battery dim only; confirm at Checkpoint C.
4. ~~Strip `data-base` handshake~~ — plan's choice: accepted as specified (T12).
