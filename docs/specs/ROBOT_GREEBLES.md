# Phase Spec: Robot Greebles (seeded, permanent hardware parts inside the silhouette)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Perf harness: `npm run perf` (`scripts/perf/profile.mjs`; hygiene rules in `docs/PERFORMANCE.md`)

Source of intent: [docs/intent/robot-greebles.md](../intent/robot-greebles.md) (Crawford's decisions, 2026-10-03). Series one-pager: [docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md). Branch `feature/robot-rework`, **after** branch 1 ([ROBOT_LIVE_VISUALS.md](ROBOT_LIVE_VISUALS.md), Phase 36) has passed its visual checkpoint — the window and lamp positions are inputs to the slot tables below. Roadmap slot: **Phase 37**. Supersedes every greeble decision in the set-aside hull record.

Survey basis (2026-10-03, against the current tree; branch 1 not yet implemented, so "after branch 1" states what that spec commits to):

- **What exists and dies.** `robotVisualHelpers.ts` exports `calculateGreebleCount` (filterFreq/detail/waveform/ADSR → 0..16), `calculateGreebleSize` (sustain → 1..6 px), `calculateGreeblePersistence` (release → 0.1..3 s), `calculateGreeblePlacementBias` (decay/release → 0..1) and `calculateDetailLevel` (filterFreq → 0..1). After branch 1 their only caller is `RobotBody.tsx`'s memo (`:103-110`), which passes the results as `greebleCount/Size/Persistence/PlacementBias` props that no shape reads. Tests: `robotVisualHelpers.greeble.test.ts` (whole file) and `robotVisualHelpers.test.ts:81-122` (`calculateGreebleCount`, `calculateDetailLevel`). Nothing else in `src` names them.
- **Seeding conventions.** `getSeededVal(noiseMap, dataId, offset = 0, min, max)` (`src/utils/getSeededVal.ts:50`). Per-robot draws use `offset = spawnCount` (`'robot.identityColor'`, `'robot.compositionSeed'`); per-robot-per-index draws use `offset = spawnCount * 10 + i` (`'robot.audio.layer.*'`, `spawnSystem.ts:300`). A *single-value* dataId must use a fixed non-zero, non-integer offset (`docs/PROCEDURAL_GENERATION.md` "Gotchas"); none of the draws here are single-value. Renaming a dataId is a breaking change to every world; adding one changes nothing already seeded.
- **"Always fresh" fields.** `spawnRobot` has a 30 % seeded chance to copy an existing robot's *audio personality* (`spawnSystem.ts:583-600`); `id`, `name`, `position`, `direction`, `melody`, `compositionSeed` and `identityColor` are computed outside that branch and never inherited. The greeble set is hardware/identity, not audio, so it joins that list.
- **Sessions and share links regenerate, never store, seeded identity.** `sessionDiff.ts` diffs audio fields only and comments (`:525-540`) that `compositionSeed` is "never diffed, always re-derived identically from the seed". Robots are a fixed roster of 12 created once per locale load (`docs/ROBOT_LIFECYCLE.md`). A field drawn at spawn from the noise map therefore reproduces byte-identically on reload and on a share-link import with no persistence work.
- **Shape interiors (96×72 body space, after branch 1).** Fixtures that a part must not overlap:
  - Sleek: hull path x 8..80, y 12..60; window ellipse (24,36) r 8×10; rivets at (14,14) (70,14) (14,58) (70,58); lamp (70,36) r 3.5; `.details` vent rect x 48..60, y 28..44 and panel lines at x 40, 60.
  - Angular: hexagon (16,36)-(24,12)-(72,12)-(80,36)-(72,60)-(24,60); window diamond centred (44,36) ±8; rivets (26,16) (70,16) (26,56) (70,56); lamp (73,36) r 3; `.details` vent x 60..68, y 28..44, stripes y 20..24 / 48..52 at x 56..64, lines x 48 and y 36.
  - Organic: ellipse centre (48,36) rx 36 ry 28; window circle (32,36) r 12; rivets (20,20) (64,20) (20,52) (64,52); lamp (60,24) r 3.5; `.details` vent ellipse (56,36) 6×8 and two seam ellipses.
  - Industrial: plates x 12..68 at y 12..28 and 44..60, right section x 72..88 y 20..52; window rect x 20..36 y 20..32; eight rivets; lamp housing x 76..84 y 28..44; `.details` vent x 44..56 y 18..34, stripes y 48..52 at x 20..28 / 52..60.
- **Render context.** `RobotBody` has one context prop, `ignoreDaylight`, passed by `RobotSelectionCard` (64 px avatar) and `RobotDisplaySection` (96 px avatar). Neither tells `RobotBody` which of the two it is.
- **Perf baseline.** The hull branch proved element count drives idle paint (`docs/PERFORMANCE.md`); the 17.2.5 idle-paint work set the current baseline. Twelve robots × N parts × elements-per-part is the number to keep down.
- **No sketch directory on this branch.** `docs/sketches/` exists only on `feature/robot-v2`; it is created here.

ASSUMPTIONS I'm making beyond the intent (correct now or I'll proceed with these):

1. **Slot model, not raw positions.** A robot stores `greebles: { kind, slot }[]`; each shape has a hand-measured table of `SLOT_COUNT = 8` slots (position + max size + a facing hint). The slot index is valid on every shape, so a waveform change re-slots the same parts onto the new outline (intent assumption 3). Redesigning a shape's interior edits its table, never robot data.
2. **Count 2..5, uniform, slots without replacement.** Drawn as `count = floor(getSeededVal(…, 'robot.greeble.count', spawnCount, 2, 6))`, then for each part a `kind` and a `slot` with `offset = spawnCount * 10 + i`, the slot chosen from the not-yet-used slots (so two parts never share one). Tune the range in the sketch.
3. **Five part kinds**, each one or two elements: `panel` (seam rectangle, 2 el), `tank` (rounded rect + highlight, 2), `dish` (circle + stroke arc, 2), `antenna` (line + dot, 2), `decal` (one filled polygon, 1). Max 10 elements per robot at count 5. The sketch may rename or swap kinds; `KIND_COUNT` is one constant.
4. **Colours come from the body.** Parts use the robot's `colors.accent` (fill), `colors.shadow` (outline/recess) and the existing fixed hardware greys (`#4f5458` rivet, `#6a6384`/`#928ba9` vent). Never `identityColor`, never `primary` (a part in the body colour disappears).
5. **Card hides, detail shows.** `RobotBody` gains `hideGreebles?: boolean`, passed only by `RobotSelectionCard`. World and detail avatar render parts.
6. **Parts render between shadow and window.** In each shape the `<RobotGreebles>` element sits after the hull highlight/shadow and before the window, lamp and `.details` groups, so fixtures always draw on top even if a slot is later mis-measured.
7. **Always fresh on the copy path**, like `identityColor`: a copied robot gets its own greeble draw.
8. **The release cliff is untouched.** The `.details` group stays exactly as branch 1 leaves it; slots are measured around it in its *shown* state so nothing collides either way.

---

## 1. Overview & Claude Explanation

### 1.1 Data: `Robot.greebles`

```ts
// src/types/Robot.ts
/** Seeded, permanent hardware parts (docs/ROBOT_DESIGN.md "Non-audio layers"). Drawn once at
 *  spawn ('robot.greeble.*' dataIds), never user-edited, never inherited on the copy path, never
 *  diffed into a session — regenerated identically from the seed. `slot` indexes the current
 *  shape's GREEBLE_SLOTS table (every shape has SLOT_COUNT entries), so a waveform change moves
 *  the same parts onto the new outline. */
export interface Greeble { kind: number; slot: number }
export interface Robot { …; greebles: Greeble[]; … }
```

`spawnSystem.ts` gains `generateGreebles(noiseMap, spawnCount): Greeble[]` next to `generateRobotIdentityColor`, called unconditionally (outside `shouldCopy`), with the Alea fallback the sibling fields use when `noiseMap` is absent:

```ts
export const GREEBLE_COUNT_RANGE = { min: 2, max: 5 } as const; // tune in the sketch

export function generateGreebles(noiseMap: NoiseFunction2D, spawnCount: number): Greeble[] {
  const count = Math.min(GREEBLE_COUNT_RANGE.max, Math.floor(
    getSeededVal(noiseMap, 'robot.greeble.count', spawnCount, GREEBLE_COUNT_RANGE.min, GREEBLE_COUNT_RANGE.max + 1)));
  const free = Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const out: Greeble[] = [];
  for (let i = 0; i < count; i++) {
    const off = spawnCount * 10 + i;
    const kind = Math.min(KIND_COUNT - 1, Math.floor(getSeededVal(noiseMap, 'robot.greeble.kind', off, 0, KIND_COUNT)));
    const pick = Math.min(free.length - 1, Math.floor(getSeededVal(noiseMap, 'robot.greeble.slot', off, 0, free.length)));
    out.push({ kind, slot: free.splice(pick, 1)[0] });
  }
  return out;
}
```

Three new dataIds: `'robot.greeble.count'`, `'robot.greeble.kind'`, `'robot.greeble.slot'`. Documented in `docs/PROCEDURAL_GENERATION.md`'s table.

### 1.2 Slot tables: `src/components/robot/greebleSlots.ts`

```ts
export const SLOT_COUNT = 8;
export interface GreebleSlot { x: number; y: number; w: number; h: number; rot?: number }
/** Hand-measured from each shape's SVG after Phase 36; every slot clears the window, lamp, rivets
 *  and the .details group in its shown state. Measured in the sketch (docs/sketches/robot-greebles.html). */
export const GREEBLE_SLOTS: Record<WaveformType, readonly GreebleSlot[]> = { sine: [...8], square: [...8], triangle: [...8], sawtooth: [...8], pulse: /* = sine */ };
```

A test asserts every table has exactly `SLOT_COUNT` entries and that no slot box intersects that shape's fixture boxes (the fixture boxes are listed in the same module, from the survey above — the test is the collision guard).

### 1.3 Vocabulary: `src/components/robot/RobotGreebles.tsx`

One stateless `React.memo` component: `({ greebles, slots, colors })` → `<g className="greebles">` with one `<g className="greeble greeble--{kind}">` per part, translated to its slot and drawn with the kind's one-or-two elements sized to the slot box. `KIND_COUNT = 5`; kinds are an ordered array of small draw functions. No per-part state, no keys beyond index (the array never reorders).

### 1.4 Wiring

- `RobotSVGProps` (all four shapes) gains `greebles?: React.ReactNode`; each shape renders `{greebles}` between its shadow and its window group (assumption 6). Shapes do not know about kinds or slots.
- `RobotBody` builds `<RobotGreebles greebles={robot.greebles} slots={GREEBLE_SLOTS[waveform]} colors={colors} />` outside the audio memo (it depends on `colors`, which is already post-daylight) unless `hideGreebles`; `RobotSelectionCard` passes `hideGreebles`.
- The never-read greeble props and the five dead helpers are deleted with their tests (survey, first bullet).

### 1.5 Guardrail amendment (one commit, four places)

Branch 1's wording gains a second layer. `CLAUDE.md` / `.github/copilot-instructions.md`:
> … — with two documented non-audio layers: `Robot.identityColor` on the window glass and lamp, and the seeded `Robot.greebles` hardware set inside the silhouette (ROBOT_DESIGN.md 'Non-audio layers'), the same class of exception as the day/night and battery brightness overlays.

`docs/ROBOT_DESIGN.md`: "Identity layer" becomes "Non-audio layers" with both; the forbidden-pattern line names both exceptions. `Robot.ts`: the `greebles` comment above.

### 1.6 What does not change

Outlines, window, lamp, rivets, vent, the release cliff, `generateColors`, body scale, battery dim, day/night, swim animation, card chrome, session/share formats (no new persisted field), `AudioEngine`.

## 2. Target File Structure

```
docs/sketches/robot-greebles.html          NEW — gate: 4 shapes × several seeded sets, world + 96 px scale
src/components/robot/
  greebleSlots.ts                          NEW — SLOT_COUNT, GREEBLE_SLOTS, fixture boxes
  greebleSlots.test.ts                     NEW — 8 per shape; no slot/fixture intersection
  RobotGreebles.tsx                        NEW — vocabulary + renderer
  RobotGreebles.test.tsx                   NEW
  RobotSleek/Angular/Organic/Industrial.tsx edit — `greebles` prop rendered between shadow and window;
                                                  greeble* props removed
  RobotBody.tsx                            edit — hideGreebles; build <RobotGreebles>; dead greeble code out
  RobotBody.test.tsx                       edit
  robotShapeVariants.test.tsx              edit — greebles slot renders where given; absent otherwise
  robotVisualHelpers.ts                    edit — five helpers deleted
  robotVisualHelpers.greeble.test.ts       DELETE
  robotVisualHelpers.test.ts               edit — greeble/detail-level tests removed
src/components/selection/RobotSelectionCard.tsx  edit — hideGreebles
src/systems/spawnSystem.ts                 edit — generateGreebles, always-fresh assignment
src/systems/spawnSystem.test.ts            edit — determinism, range, no shared slot, not inherited on copy
src/types/Robot.ts                         edit — Greeble, Robot.greebles
CLAUDE.md, .github/copilot-instructions.md, docs/ROBOT_DESIGN.md   edit — second carve-out
docs/PROCEDURAL_GENERATION.md              edit — three dataIds
docs/todo/roadmap.md                       add — Phase 37
```

## 3. Implementation Boundaries & Constraints

- **Always:** sketch sign-off before any React (Task 1 gate). Parts inside the silhouette, clear of fixtures, guarded by test. One or two elements per part; ≤ 10 per robot. `robot.greebles` is plain numbers; nothing computed is stored. Branch 1's memo split survives. `npm run build:types`, `npm run lint`, `npm test` before every commit.
- **Ask first:** a count range above 2..5; a kind with more than two elements; any slot that requires moving a fixture; storing positions instead of slots; rendering parts on the 64 px card.
- **Never:** make count/kind/slot depend on audio, battery, time or edits; animate parts; put `identityColor` on a part; persist greebles in sessions or share links; rename a dataId once shipped.

## 4. Code Style & Architecture Conventions

- `greebleSlots.ts` is data plus one constant; `RobotGreebles.tsx` is draw-only; `spawnSystem.ts` owns the draw. Same split as `identityColor` (spawn) → `getRobotColorStyle` (render).
- New groups carry `className` (`greebles`, `greeble`, `greeble--tank`) for tests, matching `.details`/`.window`/`.lamp`.
- Shapes receive the parts as a node and place it; they stay ignorant of the vocabulary. No colour computed inside a shape or inside `RobotGreebles`.

## 5. Testing & Verification Requirements

- **`spawnSystem.test.ts`:** same noise map + spawnCount → identical `greebles` (deterministic); over 60 spawns count stays within `GREEBLE_COUNT_RANGE` and takes every value; no robot has two parts on one slot; `kind < KIND_COUNT`; a copied robot's `greebles` differ from its source's (always fresh — use the deterministic/parity fixture pattern from `docs/…/parity` lessons: seed a distinguishing value).
- **`greebleSlots.test.ts`:** each of the five waveform keys maps to exactly `SLOT_COUNT` slots; no slot box intersects a fixture box for its shape; every slot box lies inside the shape's outline bounding region.
- **`RobotGreebles.test.tsx`:** renders one `.greeble` per entry with the matching `greeble--{kind}` class and a `translate(x,y)` matching its slot; element count ≤ 2 per part; no element has fill equal to `colors.primary` or the identity colour.
- **`robotShapeVariants.test.tsx`:** when `greebles` is given, it renders *after* the shadow and *before* `g.window` (DOM order); when omitted nothing with class `greebles` exists; the removed greeble props are gone from the type (`// @ts-expect-error`).
- **`RobotBody.test.tsx`:** `hideGreebles` removes `.greebles`; changing `adsr.attack` leaves `.greebles` children count unchanged (parts never pop); a muted layer leaves it unchanged; changing the Baseline waveform keeps the same `greeble--{kind}` classes with new translates (re-slot).
- **Perf gate:** `npm run perf` A/B on one session, foreground, one call at a time, no orphaned Chrome (`docs/PERFORMANCE.md`); idle paint within the 17.2.5 spread. If not, reduce elements per kind before reducing count.
- **Visual checkpoint (Crawford, by eye):** parts read as hardware at world scale; two same-shape robots are distinguishable; parts stretch with a sustain edit and scale with register; nothing overlaps a window, lamp or vent; card avatars clean; detail avatar shows parts.

## 6. Git & Workflow Context

- `feature/robot-rework`, after branch 1's visual checkpoint and before any merge. The sketch is its own commit; the guardrail amendment its own commit. PowerShell 5.1: no double quotes inside a `-m @'…'@` commit message.
- Roadmap `## 37. Robot Greebles`, Phase 35's About / Not Doing shape.

## 7. Open Questions (need Crawford before or during the plan)

1. **Count range 2..5** (assumption 2) — tune in the sketch.
2. **The five kinds** (assumption 3) — the sketch decides; a sixth is fine if it stays ≤ 2 elements.
3. **Card hides, detail shows** (assumption 5) — confirm.
4. **Colour sources** (assumption 4): accent + shadow + hardware greys. Confirm no `secondary`/`highlight` on parts.
5. **Whether the vent becomes a kind** and the release cliff loses it — sketch-stage call; the spec ships the cliff untouched.
