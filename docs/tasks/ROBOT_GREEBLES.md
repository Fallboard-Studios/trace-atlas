# Implementation Plan: Robot Greebles

Spec: [docs/specs/ROBOT_GREEBLES.md](../specs/ROBOT_GREEBLES.md). Intent: [docs/intent/robot-greebles.md](../intent/robot-greebles.md). Branch `feature/robot-rework`, **after** Phase 36 ([ROBOT_LIVE_VISUALS plan](ROBOT_LIVE_VISUALS.md)) has passed its Checkpoint C. Roadmap Phase 37.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`, `npm run perf`.

## Overview

Nine tasks in four phases. Phase 0 is the sketch gate: nothing else starts until Crawford has picked the kinds, the count range and the slot coordinates by eye. Phase 1 adds the data draw, the slot tables and the vocabulary renderer as three independent modules with no importer. Phase 2 wires them through the four shapes and `RobotBody`, deletes the dead audio-driven greeble code, and ends at the perf gate plus Crawford's visual check. Phase 3 is the second guardrail carve-out and docs. Every task leaves types, lint and the suite green; RED first, one commit per task.

## Architecture Decisions

- **Sketch before code, and the sketch is the source of the slot numbers.** Task 3's tables are transcribed from the signed-off sketch, not invented in TypeScript. The sketch commits first so the numbers have a provenance.
- **Three modules, no coupling until Task 5.** `spawnSystem` draws `{kind, slot}`; `greebleSlots.ts` says where a slot is on each shape; `RobotGreebles.tsx` draws a kind in a box. Each is tested alone before any shape changes.
- **Shapes get a node, not data.** The four shapes receive `greebles` as a ReactNode and place it between shadow and window. They never learn about kinds or slots, so the vocabulary can change without touching a shape again.
- **Delete the audio-driven greeble code only after the new path renders (Task 7).** Fail-safe: at no commit does the body lose a feature it had.

## Dependency Graph

```
T1 sketch (gate A)
  ├─► T2 Robot.greebles + generateGreebles ─┐
  ├─► T3 greebleSlots tables + collision test ─┼─► T5 shapes take `greebles` node ─► T6 RobotBody wires it, hideGreebles ─► T7 delete dead helpers
  └─► T4 RobotGreebles vocabulary ───────────┘                                                                                    │
                                                                                                        Checkpoint C (perf + visual) ─► T8 guardrail ─► T9 docs
```

Parallelisable after A: T2 ‖ T3 ‖ T4. T5 needs only T4's component type; T6 needs T2, T3, T4, T5.

## Task List

### Phase 0: Gate

## Task 1: Static sketch `docs/sketches/robot-greebles.html`

**Description:** One self-contained HTML page (no build, open in a browser). For each of the four shapes, as they stand after Phase 36 (centre-scaled root, identity window, lamp, `.details` shown): the eight candidate slot boxes drawn as outlines, the candidate vocabulary (panel, tank, dish, antenna, decal — plus any Crawford adds) drawn once each at world scale, and six seeded sets per shape rendered at world scale and at the 96 px avatar scale. A header block records the sign-off: final kinds, count range, and the slot coordinates per shape.

**Acceptance criteria:**
- [ ] Opens with no console errors; every part sits inside its shape's outline and overlaps no fixture, by eye.
- [ ] Crawford signs off kinds, count range and slot coordinates in the header (closes spec §7 Q1, Q2, Q4, Q5).
- [ ] Each kind is drawn with ≤ 2 SVG elements.

**Verification:** manual, in a browser; Crawford's sign-off recorded in the file. **Dependencies:** Phase 36 Checkpoint C. **Files:** `docs/sketches/robot-greebles.html` (new dir). **Scope:** S (one file, iterative).

### Checkpoint A: Sketch signed off
- [ ] Header carries the sign-off and the numbers Tasks 2–4 will transcribe.
- [ ] Spec §1.1 count range, §1.2 tables and §1.3 kinds amended to match.

### Phase 1: Foundations (independent modules)

## Task 2: `Robot.greebles` and `generateGreebles`

**Description:** `Greeble` type and the required `greebles` field on `Robot`; `GREEBLE_COUNT_RANGE`, `KIND_COUNT`, three dataIds and `generateGreebles` in `spawnSystem.ts`, assigned unconditionally outside `shouldCopy` with the Alea fallback the sibling fields use. `SLOT_COUNT` is imported from Task 3's module — if Task 3 is not in yet, declare it here and move it in Task 3.

**Acceptance criteria:**
- [ ] Same noise map + spawnCount → identical `greebles`; over 60 spawns count stays in range and takes every value in it; no robot repeats a slot; every `kind < KIND_COUNT`.
- [ ] A copied robot (force `shouldCopy` via the existing test pattern) has `greebles` that differ from its source's — seed a distinguishing spawnCount, per the parity-fixture lesson.
- [ ] `npm run build:types` RED on adding the required field, GREEN once `spawnRobot` sets it; existing `as unknown as Robot` fixtures are untouched.

**Verification:** `npx vitest run src/systems/spawnSystem.test.ts` ; `npm run build:types`. **Dependencies:** 1. **Files:** `src/types/Robot.ts`, `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`. **Scope:** M.

## Task 3: `greebleSlots.ts` with the collision guard

**Description:** `SLOT_COUNT = 8`, `GreebleSlot`, `GREEBLE_SLOTS` for the five waveform keys (pulse = sine's table), transcribed from the sketch; `FIXTURE_BOXES` per shape from the spec survey; a test that proves no slot box intersects a fixture box and every slot lies inside the shape's outline bounds.

**Acceptance criteria:**
- [ ] Every key has exactly `SLOT_COUNT` slots.
- [ ] Zero slot/fixture intersections per shape (axis-aligned box test); zero slots outside the outline bounds.
- [ ] Numbers match the sketch header (spot-check three per shape in the test's comments).

**Verification:** `npx vitest run src/components/robot/greebleSlots.test.ts`. **Dependencies:** 1. **Files:** `greebleSlots.ts`, `greebleSlots.test.ts`. **Scope:** S.

## Task 4: `RobotGreebles.tsx` vocabulary

**Description:** The stateless renderer: `({ greebles, slots, colors })` → `g.greebles` with one `g.greeble.greeble--{kind}` per entry, translated to its slot, drawn by the kind's draw function sized to the slot box. Colours only from `colors.accent`, `colors.shadow` and the hardware greys.

**Acceptance criteria:**
- [ ] Renders one `.greeble` per entry with the right modifier class and a `translate(x,y)` equal to its slot.
- [ ] ≤ 2 elements per part; no element's fill equals `colors.primary`; no element references an identity colour (the component has no such prop).
- [ ] Empty `greebles` renders an empty `g.greebles` (no crash, no children).

**Verification:** `npx vitest run src/components/robot/RobotGreebles.test.tsx`. **Dependencies:** 1. **Files:** `RobotGreebles.tsx`, `RobotGreebles.test.tsx`. **Scope:** S.

### Checkpoint B: Foundations
- [ ] `npm test`, `npm run build:types`, `npm run lint` green; nothing renders differently yet.

### Phase 2: Wiring

## Task 5: Shapes take a `greebles` node

**Description:** `RobotSVGProps` in all four shapes gains `greebles?: React.ReactNode`, rendered between the hull shadow and the window group; the never-read `greebleCount/Size/Persistence/PlacementBias` props leave the four local types. Parametrised test drives it.

**Acceptance criteria:**
- [ ] With a `greebles` node, it appears in DOM order after the shadow element and before `g.window`; without it, nothing with class `greebles` exists.
- [ ] A `// @ts-expect-error` fixture proves the four greeble props are gone.
- [ ] All existing variant tests pass.

**Verification:** `npx vitest run src/components/robot/robotShapeVariants.test.tsx` ; `npm run build:types` (RED until `RobotBody` stops passing the removed props — fix in the same task, minimal). **Dependencies:** 4. **Files:** 4 shapes, `robotShapeVariants.test.tsx`, `RobotBody.tsx` (prop removal only). **Scope:** M.

## Task 6: `RobotBody` wires the parts; `hideGreebles`

**Description:** `RobotBody` builds `<RobotGreebles greebles={robot.greebles} slots={GREEBLE_SLOTS[waveform]} colors={colors} />` outside the audio memo unless `hideGreebles`; `RobotSelectionCard` passes `hideGreebles`; `RobotDisplaySection` does not.

**Acceptance criteria:**
- [ ] `RobotBody.test.tsx`: `.greebles` present by default and absent with `hideGreebles`; changing only `adsr.attack` or a layer gain leaves the `.greeble` count and classes unchanged; changing the Baseline waveform keeps the same classes with different translates.
- [ ] `RobotSelectionCard` render has no `.greebles`; `RobotDisplaySection` render has one.
- [ ] The item-22 spy test still passes; `robot.greebles` is not in the memo's dependency array.

**Verification:** `npx vitest run src/components/robot src/components/selection` ; manual `npm run dev`: parts visible in world and detail avatar, absent on cards; stretch with a sustain edit. **Dependencies:** 2, 3, 5. **Files:** `RobotBody.tsx`, `RobotBody.test.tsx`, `RobotSelectionCard.tsx`, a card/detail test. **Scope:** M.

## Task 7: Delete the audio-driven greeble code

**Description:** `calculateGreebleCount/Size/Persistence/PlacementBias` and `calculateDetailLevel` leave `robotVisualHelpers.ts`; `robotVisualHelpers.greeble.test.ts` is deleted; the matching blocks in `robotVisualHelpers.test.ts` go; `RobotBody`'s remaining dead computations go.

**Acceptance criteria:**
- [ ] `grep -rn "calculateGreeble\|calculateDetailLevel" src` returns nothing.
- [ ] `npm run build:types`, `npm run lint`, `npm test` green.

**Verification:** the three commands. **Dependencies:** 6. **Files:** `robotVisualHelpers.ts`, `robotVisualHelpers.test.ts`, `robotVisualHelpers.greeble.test.ts` (del), `RobotBody.tsx`. **Scope:** S.

### Checkpoint C: Perf gate and visual (the real success criterion)
- [ ] `npm run perf` A/B against the Phase 36 tip on one session, foreground, one call at a time, no orphaned Chrome; idle paint inside the 17.2.5 spread. If outside: cut elements per kind first, count second; record the numbers in `docs/PERFORMANCE.md`.
- [ ] Crawford, `npm run dev`: parts read as hardware; two same-shape robots distinguishable; parts stretch with sustain and scale with register; nothing overlaps a fixture; cards clean, detail avatar shows parts; a reload and a share-link import reproduce the same parts.
- [ ] Spec §7 Q3 confirmed; any tuning recorded as spec §1 amendments.

### Phase 3: Guardrail and docs

## Task 8: Second guardrail carve-out (one commit)

**Description:** Spec §1.5 wording into `CLAUDE.md`, `.github/copilot-instructions.md` and `docs/ROBOT_DESIGN.md` ("Identity layer" → "Non-audio layers", both exceptions; forbidden-pattern line updated). The `Robot.ts` comment landed in Task 2.

**Acceptance criteria:**
- [ ] The two instruction files carry identical text.
- [ ] "Non-audio layers" names exactly two: identity colour (window + lamp) and the greeble set (inside the silhouette).

**Verification:** `npm run lint` ; `npm test`. **Dependencies:** Checkpoint C. **Files:** `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/ROBOT_DESIGN.md`. **Scope:** S (docs).

## Task 9: Docs, roadmap, shipped headers

**Description:** `docs/PROCEDURAL_GENERATION.md` table gains the three dataIds; `docs/ROBOT_DESIGN.md` "Greebles & Lights" rewritten (seeded set, slot tables, vocabulary, hide rule); `docs/todo/roadmap.md` gains `## 37. Robot Greebles`; intent, spec and sketch get "Shipped" headers; the series one-pager ticks branch 2.

**Acceptance criteria:**
- [ ] Every identifier the docs name exists in code (grep: `generateGreebles`, `GREEBLE_SLOTS`, `SLOT_COUNT`, `KIND_COUNT`, `GREEBLE_COUNT_RANGE`, `RobotGreebles`, `hideGreebles`, the three dataIds).
- [ ] Roadmap 37 links intent, spec, plan and sketch.

**Verification:** `npm test` ; `npm run build`. **Dependencies:** 8. **Files:** `docs/PROCEDURAL_GENERATION.md`, `docs/ROBOT_DESIGN.md`, `docs/todo/roadmap.md`, `docs/intent/robot-greebles.md`, `docs/specs/ROBOT_GREEBLES.md`, `docs/ideas/robot-visual-rework.md`. **Scope:** M (docs).

### Checkpoint D: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (known flakes re-run once).
- [ ] All nine tasks ticked with as-built notes; perf numbers in `docs/PERFORMANCE.md`.
- [ ] `code-review-and-quality` pass; push/PR is Crawford's call.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Slot tables measured against a body that Phase 36's checkpoint later moves | Med | Sketch (T1) starts only after Checkpoint C of Phase 36; collision test (T3) catches drift |
| Element count regresses idle paint | Med | ≤ 2 el/part, ≤ 5 parts; perf gate at Checkpoint C with a stated cut order |
| Required `greebles` field breaks test fixtures | Low | Fixtures use `as unknown as Robot`; `RobotGreebles` treats `undefined` as empty |
| Two parts visually crowd even without box overlap | Low | Six seeded sets per shape in the sketch; slot boxes carry margin |
| A dataId name needs changing after shipping | High | Names fixed at T2; never renamed (PROCEDURAL_GENERATION rule) |

## Open Questions

- Spec §7 Q1, Q2, Q4, Q5 close at Checkpoint A (sketch); Q3 at Checkpoint C.
