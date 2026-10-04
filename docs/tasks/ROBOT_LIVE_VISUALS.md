# Implementation Plan: Robot Live Visuals

Spec: [docs/specs/ROBOT_LIVE_VISUALS.md](../specs/ROBOT_LIVE_VISUALS.md) (§7 Q1 accepted, Q3 widened, 2026-10-03). Intent: [docs/intent/robot-live-visuals.md](../intent/robot-live-visuals.md). Branch `feature/robot-rework`. Roadmap Phase 36.

Commands: `npx vitest run <path>` (focused), `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`.

## Overview

Thirteen tasks in four phases. Phase 1 adds pure helpers with nothing importing them (additive, zero risk). Phase 2 swaps `RobotBody` and the four shapes onto those helpers — the "edits reach the body" slice — and deletes the spawn snapshot once nothing reads it. Phase 3 lands the three colour slices (shading, window, lamp), each a vertical cut through the four shapes plus `RobotBody`, ending at Crawford's visual checkpoint. Phase 4 is the guardrail amendment and docs. Every task leaves types, lint and the suite green; RED first, one commit per task.

## Architecture Decisions

- **Helpers before consumers.** Tasks 1–4 export new functions from `robotVisualHelpers.ts` without changing any existing signature, so the shapes and `RobotBody` keep compiling until Task 5 switches them over.
- **Four shapes are edited in lockstep, test-driven by the one parametrised file.** `robotShapeVariants.test.tsx` already runs every assertion against all four; each shape task adds its assertions there first and then edits the four files to the same contract. That is why shape tasks touch 5–6 files and are still one task: the four edits are the same edit.
- **The snapshot is deleted the moment it has no reader (Task 8), not at the end.** Fail fast on the type change; `npm run build:types` is the gate.
- **The guardrail amendment is its own commit (Task 12),** touching exactly the four places the spec lists, after the window and lamp exist.

## Dependency Graph

```
T1 bodyShapeFromAdsr ─┐
T2 calculateBodyScale ─┼─► T5 shape contract (scale, transform) ─► T6 RobotBody live ─► T8 delete snapshot
T3 calculateLampIntensity ──────────────────────────────────────────┐        │
T4 colours (highlight/shadow/identityGlass) ─► T9 shading           │        ├─► T7 avatar viewBox
                                           └─► T10 window ──────────┴─► T11 lamp ─► Checkpoint C (visual)
                                                                                      └─► T12 guardrail ─► T13 docs
```

Parallelisable: T1 ‖ T2 ‖ T3 ‖ T4 (all independent); T7 any time after T5; T9 after T4; T10 after T6; T11 after T3 + T10.

## Task List

### Phase 1: Foundations (additive helpers, no importers)

## Task 1: `bodyShapeFromAdsr` and `BODY_NORMALISER`

**Description:** Add the live replacement for the spawn snapshot's three formulas to `robotVisualHelpers.ts`, normalised by the seeded range (attack 5, sustain 1, release 5). Nothing calls it yet.

**Acceptance criteria:**
- [ ] `bodyShapeFromAdsr({attack:0,decay:0,sustain:0,release:0})` → `{ scale: 1, roundness: 0, detail: 0 }` (the migrated spawn assertion).
- [ ] attack 5 and attack 10 both → scale 0.25 (clamp); release 2.5 → detail exactly 0.5; sustain 1 → roundness 1.
- [ ] `BODY_NORMALISER` is exported and equals `{ attack: 5, sustain: 1, release: 5 }`.

**Verification:**
- [ ] `npx vitest run src/components/robot/robotVisualHelpers.test.ts`
- [ ] `npm run build:types`

**Dependencies:** None. **Files:** `robotVisualHelpers.ts`, `robotVisualHelpers.test.ts`. **Scope:** S.

## Task 2: `calculateBodyScale` and `BODY_SCALE_MIN`

**Description:** The final body scale in one place: register step × attack bias, floored at 0.735.

**Acceptance criteria:**
- [ ] treble register `[3,5]` + bodyScale01 0 → exactly `BODY_SCALE_MIN`; bass `[1,3]` + 1 → 1.69 (`toBeCloseTo`).
- [ ] mid register `[2,4]` + 0.5 → 1.0 (floor does not apply above it).
- [ ] `BODY_SCALE_MIN` ≥ 0.49 × 1.5.

**Verification:** same two commands. **Dependencies:** None. **Files:** `robotVisualHelpers.ts`, `robotVisualHelpers.test.ts`. **Scope:** S.

## Task 3: `calculateLampIntensity` and `LAMP_MIN`

**Description:** Averaged audible-layer gain blended 60/40 with detail, clamped; fallback gain 1 when every layer is muted or `layers` is undefined.

**Acceptance criteria:**
- [ ] `[{gain:0},{gain:0},{gain:0}]`, detail 0 → 0.6 (fallback 1 × 0.6); `undefined`, detail 1 → 1.
- [ ] `[{gain:1.2},{gain:0},{gain:1.2}]`, detail 1 → 1 (clamped; muted layer excluded — assert via `[{gain:0.2},{gain:0}]`, detail 0 → 0.12, not 0.06).
- [ ] `LAMP_MIN` exported, 0.4.

**Verification:** same. **Dependencies:** None. **Files:** `robotVisualHelpers.ts`, `robotVisualHelpers.test.ts`. **Scope:** S.

## Task 4: `highlight`/`shadow` on `RobotColors`, `identityGlass`, delete `darken`

**Description:** `generateColors` fills two new fields (secondary hue L+25 cap 95; accent hue L−25 floor 5); `applyLightnessMultiplier` maps all five; `identityGlass(hex)` returns `{ glass, sheen }` via `colorUtils`' `hexToHsl`/`hslToString`; the unused `darken` goes.

**Acceptance criteria:**
- [ ] For a fixed envelope, `highlight` L > `primary` L > `shadow` L; both are `hsl(...)` strings; `applyLightnessMultiplier(colors, 0)` zeroes all five L values.
- [ ] `identityGlass` on every `ROBOT_IDENTITY_COLOR_NAMES` hex returns `glass === hex` and a `sheen` whose L is greater (cap 95).
- [ ] `darken` is no longer exported (grep).

**Verification:** same. **Dependencies:** None. **Files:** `robotVisualHelpers.ts`, `robotVisualHelpers.test.ts`. **Scope:** S.

### Checkpoint A: Foundations
- [ ] `npm test`, `npm run build:types`, `npm run lint` green; no runtime behaviour has changed (the shapes still render byte-identically).

### Phase 2: Edits reach the body

## Task 5: Shape contract — `scale` alone, centre-scaled root, `ShapeParams = { torsoAspect }`

**Description:** The four shapes drop `scaleBias`/`appendageLength` from their local prop types, apply `scale` directly, and scale about (48,36). `ShapeParams` in `robotVisualHelpers.ts` is trimmed and `shapeParamsFromAudio` loses its dead bias/appendage arithmetic. `RobotBody` is adjusted only enough to compile (passes `scale * (1 + scaleBias)` itself for now).

**Acceptance criteria:**
- [ ] Parametrised test: root `transform` is `translate(48,36) scale(2) translate(-48,-36)` for `scale={2}`; the inner `scale(torsoAspect,1)` group is unchanged.
- [ ] `shapeParams={{ torsoAspect: 1 }}` is the full type; a `// @ts-expect-error` fixture proves `appendageLength` and `scaleBias` are gone.
- [ ] Existing `.details`, `dimOpacity`, no-propeller tests still pass.

**Verification:**
- [ ] `npx vitest run src/components/robot` ; `npm run build:types`
- [ ] Manual: `npm run dev`, robots render at the same sizes as before, flips still pivot correctly.

**Dependencies:** None (Tasks 1–2 are only consumed in Task 6). **Files:** 4 shapes, `robotVisualHelpers.ts`, `robotShapeVariants.test.tsx`, `RobotBody.tsx` (minimal). **Scope:** M (the four shape edits are one edit).

## Task 6: `RobotBody` goes live — snapshot preference removed

**Description:** The memo uses `bodyShapeFromAdsr(adsr)` for shape/detail, `calculateBodyScale` for `scale`, and release for `detailLevel`; the `mapVisualAudioToProps` import and the `mapped.*` preferences go (greeble count falls through to `calculateGreebleCount`, still unrendered). The 70/30 torso blend stays. `lampIntensity` is computed in the memo for Task 11.

**Acceptance criteria:**
- [ ] `RobotBody.test.tsx`: two renders differing only in `adsr.attack` (0.1 vs 4) give different root `scale(...)`; differing only in `adsr.release` (1 vs 4) toggles `.details`.
- [ ] The item-22 spy test (`shapeParamsFromAudio` not recomputed per lighting tick) still passes; the memo dependency array is unchanged.
- [ ] `RobotBody.tsx` no longer imports `robotVisualMapper`.

**Verification:**
- [ ] `npx vitest run src/components/robot` ; `npm run build:types`
- [ ] Manual: drag attack / sustain / release in Robot Options → size, width, detail change live; smallest robot visibly larger.

**Dependencies:** 1, 2, 3, 5. **Files:** `RobotBody.tsx`, `RobotBody.test.tsx`. **Scope:** S.

## Task 7: Avatars reframed

**Description:** Both avatar `<svg>`s take `viewBox="-40 -52 176 176"` (centred on 48,36, 176 wide per §7 Q3).

**Acceptance criteria:**
- [ ] Both files carry the new viewBox; a render test on `RobotSelectionCard` asserts it.
- [ ] Manual: the largest robot (bass register, fast attack) is unclipped and centred in the 64 px card avatar and the 96 px detail avatar.

**Verification:** `npx vitest run src/components/selection src/components/robot/RobotDisplaySection*` ; `npm run dev`. **Dependencies:** 5. **Files:** `RobotSelectionCard.tsx`, `RobotDisplaySection.tsx`, one test. **Scope:** XS.

## Task 8: Delete the snapshot

**Description:** `visualAudioMap` leaves `AudioAttributes`; `ShapeParams`/`LayerVisual`/`VisualAudioMap` leave `layeredAudio.ts`; `robotVisualMapper.ts` + test are deleted; `spawnSystem.ts` drops the snapshot block and `ADSR_MAX`; the three spawn tests that asserted on it are removed (their numbers live in Task 1's tests).

**Acceptance criteria:**
- [ ] `spawnSystem.test.ts`: `generateAudioAttributes(...)` has no `visualAudioMap` key (`not.toHaveProperty`).
- [ ] `grep -r visualAudioMap src` returns nothing; `grep -r ADSR_MAX src` returns nothing.
- [ ] RED first: deleting the type makes `npm run build:types` fail until every site is trimmed; GREEN after.

**Verification:** `npm run build:types` ; `npm test` ; `npm run lint`. **Dependencies:** 6. **Files:** `Robot.ts`, `layeredAudio.ts`, `robotVisualMapper.ts` (del), `robotVisualMapper.test.ts` (del), `spawnSystem.ts`, `spawnSystem.test.ts`. **Scope:** M.

### Checkpoint B: Live body
- [ ] Suite, types, lint, `npm run build` green.
- [ ] Manual: a saved session and a share link from before this branch still load (no snapshot in either — confirm by loading one of each).
- [ ] Review with Crawford before the colour slices.

### Phase 3: Colour slices

## Task 9: Shading from the robot's own colours

**Description:** Every `#a9adb0` highlight fill and `#000000` shadow fill in the four shapes becomes `colors.highlight` / `colors.shadow`; per-shape opacities unchanged. `RobotBody` already passes the five-field `colors`.

**Acceptance criteria:**
- [ ] Parametrised test: no element has fill `#a9adb0` or `#000000`; at least one element has fill `colors.highlight` and one `colors.shadow` (fixture gains both fields).
- [ ] `RobotBody.test.tsx` day/night test still passes (highlight/shadow dim with the body).

**Verification:** `npx vitest run src/components/robot` ; manual: shading reads as the same flat style, less grey. **Dependencies:** 4. **Files:** 4 shapes, `robotShapeVariants.test.tsx`. **Scope:** M.

## Task 10: Window glass carries the identity colour

**Description:** `RobotSVGProps` gains `identityColor`; `RobotBody` passes `robot.identityColor` (read outside the memo) and derives `{ glass, sheen }` via `identityGlass`; each shape's window group becomes `<g className="window" opacity={dimOpacity}>` with glass/sheen fills; `#78cce2`/`#b3e5f2`/`#e0ffff` are gone. `RobotBody.test.tsx` selects `g.window`.

**Acceptance criteria:**
- [ ] Parametrised test: `g.window` exists, carries `opacity={dimOpacity}` (the `[opacity="1"]` test is rewritten to this selector), first fill equals the fixture's glass; no `#78cce2` anywhere.
- [ ] `RobotBody.test.tsx`: changing only `identityColor` changes the window fill and nothing else (root transform and primary fill equal).
- [ ] Battery-dim and `ignoreDaylight` tests pass unchanged in meaning.

**Verification:** `npx vitest run src/components/robot` ; manual: every robot's window hue matches its card. **Dependencies:** 4, 6. **Files:** 4 shapes, `RobotBody.tsx`, `robotShapeVariants.test.tsx`, `RobotBody.test.tsx`. **Scope:** M.

## Task 11: One lamp on every shape

**Description:** `RobotSVGProps` gains `lampOpacity`; `RobotBody` computes `(LAMP_MIN + (1 − LAMP_MIN) × lampIntensity) × dimOpacity` outside the memo; each shape renders `<g className="lamp" opacity={lampOpacity}>` outside `.details` at the spec's §1.6 positions, glass + sheen fills; Organic's and Industrial's green lights are deleted (Industrial's `#818589` housing stays, outside the lamp group).

**Acceptance criteria:**
- [ ] Parametrised test: `g.lamp` exists at `detailLevel={0.2}` with `opacity={lampOpacity}`; no `#39ff14`/`#a2ff8a`; Industrial has `#818589` outside `g.lamp`.
- [ ] `RobotBody.test.tsx`: differing only in `layers[1].gain` (0 vs 1) changes `g.lamp` opacity; full battery + all layers muted → opacity ≥ `LAMP_MIN`; critical battery → 0.1 × that.
- [ ] Lamp opacity is not in the memo's dependency array (battery is not audio).

**Verification:** `npx vitest run src/components/robot` ; `npm run build:types`. **Dependencies:** 3, 10. **Files:** 4 shapes, `RobotBody.tsx`, `robotShapeVariants.test.tsx`, `RobotBody.test.tsx`. **Scope:** M.

### Checkpoint C: Visual (Crawford, `npm run dev`) — the real success criterion
- [ ] Window hue matches each card; lamp visible on every robot, including a quiet short-release one.
- [ ] Attack / sustain / release edits change size, width, detail, shading; muting a layer dims the lamp.
- [ ] Smallest robot visibly larger; avatars centred and unclipped; shading reads as the same style, less grey.
- [ ] Tunings recorded in the spec as §1 amendments: §7 Q2 (clamp vs shift), Q4 (shading), Q5 (`LAMP_MIN`), Q6 (placements).

### Phase 4: Guardrail and docs

## Task 12: Guardrail amendment (one commit, four places)

**Description:** The spec's §1.7 wording lands in `CLAUDE.md:49`, `.github/copilot-instructions.md:43`, `docs/ROBOT_DESIGN.md` (forbidden pattern + new "Identity layer" section), and the `identityColor` comment in `Robot.ts`; `spawnSystem.ts`'s "13 hue keys" doc line becomes 18.

**Acceptance criteria:**
- [ ] The two instruction files carry identical guardrail text (diff the lines).
- [ ] "Identity layer" names exactly two elements: window glass and lamp.
- [ ] `grep -rn "13 hue" src docs CLAUDE.md` returns nothing.

**Verification:** `npm run lint` ; `npm test` (docs tests). **Dependencies:** 10, 11. **Files:** `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/ROBOT_DESIGN.md`, `src/types/Robot.ts`, `src/systems/spawnSystem.ts`. **Scope:** M (docs only).

## Task 13: Docs, roadmap, shipped headers

**Description:** `docs/ROBOT_DESIGN.md` "Shape Parameters" / "Greebles & Lights" rewritten to the live model (no "preferred source", lights wired, greebles still unrendered pending Phase 37); `docs/AUDIO_SYSTEM.md:195-209, 548` lose the snapshot; `docs/todo/roadmap.md` gains `## 36. Robot Live Visuals` (About / Not Doing, Phase 35's shape); intent and spec get "Shipped" headers; the series one-pager ticks branch 1.

**Acceptance criteria:**
- [ ] `grep -rn visualAudioMap docs CLAUDE.md .github` returns only historical mentions in `docs/tasks/archive` and `docs/specs/ROBOT_LIVE_VISUALS.md`.
- [ ] Every identifier the docs name exists in code (grep each: `bodyShapeFromAdsr`, `calculateBodyScale`, `calculateLampIntensity`, `identityGlass`, `BODY_SCALE_MIN`, `LAMP_MIN`, `BODY_NORMALISER`).
- [ ] Roadmap 36 links idea, intent, spec, plan.

**Verification:** `npm test` ; `npm run build`. **Dependencies:** 12. **Files:** `docs/ROBOT_DESIGN.md`, `docs/AUDIO_SYSTEM.md`, `docs/todo/roadmap.md`, `docs/intent/robot-live-visuals.md`, `docs/specs/ROBOT_LIVE_VISUALS.md`, `docs/ideas/robot-visual-rework.md`. **Scope:** M (docs only).

### Checkpoint D: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (known flakes only, re-run once).
- [ ] Checkpoint C tunings recorded in the spec; all 13 tasks ticked with as-built notes.
- [ ] `code-review-and-quality` pass; push/PR is Crawford's call.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Centre-scaling shifts world positions by `(48(1−s), 36(1−s))` | Low | No system reads body size; Task 5 manual check on flips and docking |
| Normaliser change resizes every seed | Med (visual) | Accepted (§7 Q1); Checkpoint C judges the distribution; `BODY_SCALE_MIN` and the steps are one-line tunables |
| `[opacity="1"]` selector ambiguity once `lampOpacity` exists | Low | Task 10 rewrites it to `g.window` before Task 11 adds the lamp |
| A shape task leaves one of the four out of step | Med | The parametrised test runs every assertion on all four; no shape-specific escape hatches |
| Deleting `layeredAudio` types breaks an unexpected importer | Low | Survey: only `robotVisualMapper.ts`, `Robot.ts`, `layeredAudio.ts` name them; `build:types` is the RED gate |
| Lamp too dim on quiet robots | Low | `LAMP_MIN` floor; tune at Checkpoint C |

## Open Questions

- §7 Q2, Q4, Q5, Q6 — closed by eye at Checkpoint C, recorded in the spec.
