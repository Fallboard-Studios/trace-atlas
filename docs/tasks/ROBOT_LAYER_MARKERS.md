# Implementation Plan: Robot Layer Markers

Spec: [docs/specs/ROBOT_LAYER_MARKERS.md](../specs/ROBOT_LAYER_MARKERS.md). Intent: [docs/intent/robot-layer-markers.md](../intent/robot-layer-markers.md). Branch `feature/robot-rework`, after Phase 37's Checkpoint C ([ROBOT_GREEBLES plan](ROBOT_GREEBLES.md)); the socket positions are in Phase 37's sketch header and `FIXTURE_BOXES`. Roadmap Phase 38.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`.

## Overview

Seven tasks in three phases. Phase 1 adds the brightness helper, the position table and the renderer as three independent units with no importer. Phase 2 places the node in the four shapes and wires `RobotBody`, ending at Crawford's visual checkpoint. Phase 3 is the third widening of the identity carve-out and docs. Smallest of the three branches: no data, no seeding, no deletion. Every task leaves types, lint and the suite green; RED first, one commit per task.

## Architecture Decisions

- **Same three-unit split as greebles** (helper → data → renderer, then shapes take a node, then `RobotBody` composes). The shape of the code is already decided by the two earlier branches; this plan only sequences it.
- **Positions are transcribed, not chosen.** Task 2 copies the two per-shape positions from the Phase 37 sketch header; its test proves they sit inside `FIXTURE_BOXES`, which is the contract that greebles honoured.
- **Battery stays outside the memo.** Task 5 computes lit values inside the audio memo and multiplies dim outside, copying the lamp line for line; the item-22 spy test is the guard.

## Dependency Graph

```
T1 socketLitOpacity ─┐
T2 SOCKET_POSITIONS ─┼─► T4 shapes take `sockets` node ─► T5 RobotBody composes ─► Checkpoint B (visual) ─► T6 guardrail ─► T7 docs
T3 RobotLayerSockets ┘
```

Parallelisable: T1 ‖ T2 ‖ T3. T4 needs T3's component type only; T5 needs T1, T2, T3, T4.

## Task List

### Phase 1: Foundations (independent units)

## Task 1: `socketLitOpacity` and the three constants

**Description:** `SOCKET_DARK`, `SOCKET_MIN`, `SOCKET_GAIN_MAX` and `socketLitOpacity(gain)` in `robotVisualHelpers.ts`. Nothing calls it yet.

**Acceptance criteria:**
- [ ] `socketLitOpacity(0)` and `(undefined)` → `SOCKET_DARK`; `(1.2)` → 1; `(2)` → 1; `(0.2)` → `SOCKET_MIN + (1 − SOCKET_MIN) × (0.2 / 1.2)` (`toBeCloseTo`).
- [ ] Monotonic non-decreasing over 0.01..1.2 in 0.01 steps.
- [ ] `SOCKET_MIN === LAMP_MIN`.

**Verification:** `npx vitest run src/components/robot/robotVisualHelpers.test.ts` ; `npm run build:types`. **Dependencies:** Phase 37 Checkpoint C. **Files:** `robotVisualHelpers.ts`, `robotVisualHelpers.test.ts`. **Scope:** S.

## Task 2: `SOCKET_POSITIONS` with the containment guard

**Description:** `Pos` and `SOCKET_POSITIONS` (five waveform keys, pulse = sine) added to `greebleSlots.ts`, transcribed from the Phase 37 sketch header; test proves each socket's r-3 box lies inside that shape's `FIXTURE_BOXES` and clear of window, lamp and vent boxes.

**Acceptance criteria:**
- [ ] Exactly two positions per key.
- [ ] Each socket box ⊂ a fixture box of its shape; zero intersections with window/lamp/vent boxes.
- [ ] Numbers match the sketch header (cited in test comments).

**Verification:** `npx vitest run src/components/robot/greebleSlots.test.ts`. **Dependencies:** Phase 37 Task 3. **Files:** `greebleSlots.ts`, `greebleSlots.test.ts`. **Scope:** S.

## Task 3: `RobotLayerSockets.tsx` renderer

**Description:** Draw-only memo component per spec §1.3: `g.sockets` → two `g.socket` with modifier classes and translates; housing ring (`fill="none"`, stroke housing) outside an opacity group holding glass + sheen.

**Acceptance criteria:**
- [ ] Always two `.socket` (`socket--coaxial`, `socket--harmonic`) with `translate(x,y)` equal to positions.
- [ ] Housing ring is not a descendant of the opacity group; the opacity group carries `opacities[i]`.
- [ ] ≤ 3 elements per socket; fills are exactly `glass`/`sheen`, stroke exactly `housing`.

**Verification:** `npx vitest run src/components/robot/RobotLayerSockets.test.tsx`. **Dependencies:** None. **Files:** `RobotLayerSockets.tsx`, `RobotLayerSockets.test.tsx`. **Scope:** S.

### Checkpoint A: Foundations
- [ ] `npm test`, `npm run build:types`, `npm run lint` green; nothing renders differently yet.

### Phase 2: Wiring

## Task 4: Shapes take a `sockets` node after the lamp

**Description:** `RobotSVGProps` in all four shapes gains `sockets?: React.ReactNode`, rendered immediately after `g.lamp` and before `.details`. Parametrised test drives it.

**Acceptance criteria:**
- [ ] With a `sockets` node: DOM order is `g.lamp` → `g.sockets` → `.details` (when details shown); without it, no `.sockets`.
- [ ] All existing variant tests pass.

**Verification:** `npx vitest run src/components/robot/robotShapeVariants.test.tsx` ; `npm run build:types`. **Dependencies:** 3. **Files:** 4 shapes, `robotShapeVariants.test.tsx`. **Scope:** M (one edit × 4).

## Task 5: `RobotBody` composes the sockets

**Description:** `socketLit: [number, number]` from `layers[1]`/`layers[2]` gain inside the audio memo; `socketOpacities = socketLit × dimOpacity` outside it; `<RobotLayerSockets positions={SOCKET_POSITIONS[waveform]} opacities glass sheen housing={colors.shadow} />` passed to the shape on every render context.

**Acceptance criteria:**
- [ ] `RobotBody.test.tsx`: `layers` undefined → two sockets, both at `SOCKET_DARK`; `layers[1].gain` 0 vs 1 changes only the coaxial opacity; critical battery multiplies both by 0.1; changing only `identityColor` changes socket glass fill and nothing else.
- [ ] `RobotSelectionCard` and `RobotDisplaySection` renders each contain two `.socket`.
- [ ] Item-22 spy test passes; `batteryLevel` is not in the memo's dependency array.

**Verification:** `npx vitest run src/components/robot src/components/selection` ; manual `npm run dev`: drag a layer gain → socket relights live; mute → dark socket, housing visible; company broadcast relights every member. **Dependencies:** 1, 2, 4. **Files:** `RobotBody.tsx`, `RobotBody.test.tsx`, card/detail test. **Scope:** M.

### Checkpoint B: Visual (Crawford, `npm run dev`) — the real success criterion
- [ ] 0 / 1 / 2 lit sockets distinguishable at world scale and on cards; a dark socket reads as a fixture; sockets match the card colour; lamp still reads as the primary carrier.
- [ ] Spec §7 Q1, Q2, Q4 closed by eye and recorded as §1 amendments; Q3 confirmed.

### Phase 3: Guardrail and docs

## Task 6: Identity carve-out names three carriers (one commit)

**Description:** Spec §1.5 into `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/ROBOT_DESIGN.md` "Non-audio layers", and the `identityColor` comment in `src/types/Robot.ts`.

**Acceptance criteria:**
- [ ] The two instruction files carry identical text naming window glass, lamp and the two layer sockets.
- [ ] ROBOT_DESIGN states that a socket's lit state is audio (gain) and only its hue is identity.

**Verification:** `npm run lint` ; `npm test`. **Dependencies:** Checkpoint B. **Files:** the four. **Scope:** S (docs).

## Task 7: Docs, roadmap, shipped headers

**Description:** `docs/ROBOT_DESIGN.md` gains the sockets under "Non-audio layers" with the brightness curve; `docs/todo/roadmap.md` gains `## 38. Robot Layer Markers`; intent and spec get "Shipped" headers; the pods one-pager's header becomes "static half shipped (Phase 38); motion remains"; the series one-pager ticks branch 3.

**Acceptance criteria:**
- [ ] Every identifier the docs name exists (grep: `socketLitOpacity`, `SOCKET_DARK`, `SOCKET_MIN`, `SOCKET_GAIN_MAX`, `SOCKET_POSITIONS`, `RobotLayerSockets`).
- [ ] Roadmap 38 links intent, spec, plan.

**Verification:** `npm test` ; `npm run build`. **Dependencies:** 6. **Files:** `docs/ROBOT_DESIGN.md`, `docs/todo/roadmap.md`, `docs/intent/robot-layer-markers.md`, `docs/specs/ROBOT_LAYER_MARKERS.md`, `docs/ideas/layer-pods-and-follow-through.md`, `docs/ideas/robot-visual-rework.md`. **Scope:** M (docs).

### Checkpoint C: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (known flakes re-run once).
- [ ] All seven tasks ticked with as-built notes.
- [ ] `code-review-and-quality` pass on the whole series; push/PR is Crawford's call.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Socket positions drift from the Phase 37 sketch | Low | Task 2's containment test against `FIXTURE_BOXES` |
| Six more elements per robot after the greeble gate | Low | Spec §7 Q4: drop the sheen first; re-run `npm run perf` only if Phase 37's gate was tight |
| Sockets outshine the lamp and blur the identity read | Med (visual) | r 3 vs 3.5 and `SOCKET_MIN`; Checkpoint B |
| Battery dim leaks into the memo | Low | Item-22 spy test; dependency-array assertion in Task 5 |

## Open Questions

- Spec §7 Q1, Q2, Q4 close at Checkpoint B; Q3 (normalise by 1.2) is the Phase 36 ruling, confirm in passing.
