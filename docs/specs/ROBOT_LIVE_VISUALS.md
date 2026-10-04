# Phase Spec: Robot Live Visuals (edits reach the body; window + lamp carry the card colour)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-live-visuals.md](../intent/robot-live-visuals.md) (confirmed 2026-10-03). Series one-pager: [docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md) — the intent wins where they differ (identity colour lands in this branch). Branch `feature/robot-rework`, off `main` at `5d21cf59` (PR #525, world colours) plus `b4368e80` (propellers removed). Roadmap slot: **Phase 36** (free on `main`; the unmerged `feature/robot-v2` used the number for the set-aside hull). First of three sequenced branches (→ greebles → layer markers); the other two are not specced.

Survey basis (2026-10-03, against the current tree):

- **The snapshot wins over the live path, and it is never refreshed.** `generateAudioAttributes` (`src/systems/spawnSystem.ts:290-340`) builds `visualAudioMap = { averagedGain, shapeParams: { scale, roundness, detail }, layerVisuals }` once. `RobotBody.tsx:72-110` calls `mapVisualAudioToProps(visualAudioMap)` and takes `bodyShapeProps` for torso aspect, scale bias **and** the detail level (`const detail = bodyShape.detail ?? calculateDetailLevel(filterFreq)` — `bodyShape.detail` is always present, so the cutoff branch is dead). Only four non-test files name the field: `RobotBody.tsx`, `robotVisualMapper.ts`, `spawnSystem.ts`, `src/types/Robot.ts`. Neither `src/types/session.ts` nor `sessionDiff.ts` nor `sessionShareUtils.ts` carry it — the session diff copies `adsr`, `layers`, `filterFreq`, `octaveRange` field by field (`sessionDiff.ts:234-259`) and merges them over the live `audioAttributes` (`:371`). No persisted data or share link holds the snapshot; deleting it has no migration surface.
- **Three formulas, one mismatched normaliser.** `scale = 0.25 + (1 − attack/ADSR_MAX.attack) × 0.75`, `roundness = sustain/ADSR_MAX.sustain`, `detail = release/ADSR_MAX.release`, with `ADSR_MAX = { attack: 2, decay: 2, sustain: 1, release: 5 }` (`spawnSystem.ts:58`). But attack and release are *seeded* over 0..5 s (`ATTACK_RANGE`/`RELEASE_RANGE`, `:48-51`) and *editable* over 0..10 s (`ATTACK_SCHEMA`/`RELEASE_SCHEMA`, `src/data/robotOptionsConfig.ts:241-246`, log sliders). So any attack above 2.67 s clamps `scale` to 0 — roughly half the seeded population sits at the smallest body size today. That is the most likely cause of "they're all too small".
- **The real size floor is 0.49, not 0.42.** Overall body scale is `calculateScale(octaveRange)` (0.7 / 1.0 / 1.3 by register, `robotVisualHelpers.ts`) × `(1 + scaleBias)` inside each shape, where `RobotBody.tsx` sets `scaleBias = clamp(−0.4, 0.4, (bodyShape.scale − 0.5) × 0.6)`. `bodyShape.scale` spans 0..1, so the bias spans −0.3..0.3 and the floor is 0.7 × 0.7 = 0.49, the ceiling 1.3 × 1.3 = 1.69. (`shapeParamsFromAudio`'s own `scaleBias` is computed and discarded — only its `torsoAspect` is blended, 30 %, into the ADSR-driven one.) The intent's 0.42 was corrected to this during the survey.
- **The avatars already clip.** `RobotSelectionCard.tsx:121` and `RobotDisplaySection.tsx:70` render `<RobotBody>` inside `viewBox="-80 -80 160 160"` (64 px and 96 px CSS boxes). Every shape scales about the origin and draws its 96×72 nested `<svg>` from (0,0), so at scale 1 the body spans 0..96 × 0..72 and the right 16 units are already cut off; at 1.69 it is 162 units wide. Raising the floor makes this worse, so the avatar framing is in scope.
- **Fixed colours in the four shapes.** Highlight `#a9adb0` (opacity 0.6; Organic 0.5), shadow `#000000` (0.3; Organic 0.2), window `#78cce2` / `#b3e5f2` (0.8 / 0.6; Organic adds `#e0ffff`), rivets `#4f5458`, vent greys `#6a6384` / `#928ba9` / `#3b374d`, status light `#39ff14` / `#a2ff8a` (Organic and Industrial only, inside the `detailLevel > 0.5` `.details` group), Industrial's light housing `#818589`. `colors.secondary` is in every shape's props type and read by none; `colors.accent` draws panel lines and warning stripes.
- **Identity colour is a hex string.** `generateRobotIdentityColor` (`spawnSystem.ts:143-148`) returns `ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[index]]`, i.e. `#rrggbb`; `getRobotColorStyle` (`traitColors.ts:175`) validates exactly that. `ROBOT_IDENTITY_COLOR_NAMES` has 18 entries; the `Robot.ts` comment and the spawn helper's doc both still say 13.
- **Colour helpers available.** `robotVisualHelpers.ts` has private `parseHslString`/`adjustHslLightness` and an exported `darken(hsl, factor)` (unused); `src/utils/colorUtils.ts` exports `hexToHsl`, `hslToString`, `clamp`, `shiftHSL`, `applyColorShift`.
- **Lighting re-render split (backlog item 22).** `RobotBody.tsx`'s `useMemo` holds everything audio-derived; `lightnessMultiplier` is read once, outside it, in `applyLightnessMultiplier`. `RobotBody.test.tsx` pins this with a spy on `shapeParamsFromAudio` across the module boundary.
- **Tests that pin the old shape.** `spawnSystem.test.ts:122-163` (three snapshot assertions), `robotVisualMapper.test.ts` (whole file), `robotShapeVariants.test.tsx` (`appendageLength` in a fixture; `scale(2)`/`scale(3)` transform strings; `[opacity="1"]` uniquely identifies the dim group), `RobotBody.test.tsx` (selects the window by `ellipse[fill="#78cce2"]`; `path` first-child fill = primary).
- **Docs that state the old shape.** `docs/ROBOT_DESIGN.md` ("preferred source", "lightsProps is unwired", the forbidden "static/fixed color palette"), `docs/AUDIO_SYSTEM.md:195-209, 548` (persist / prefer `visualAudioMap`), `CLAUDE.md:49` and `.github/copilot-instructions.md:43` (the Visual Mapping guardrail).

ASSUMPTIONS I'm making beyond the intent's decisions (correct now or I'll proceed with these):

1. **The visual normaliser matches the seeded range, not the old `ADSR_MAX`.** Attack and release normalise by 5 s (the spawn maximum), sustain by 1. Edits above 5 s clamp. This spreads the seeded population across the whole size/detail range instead of piling half of it at the floor. It changes every robot's size on every seed — unavoidable for a branch whose whole point is live, honest mapping, but it is a visible world change. Flagged in §7.
2. **The size floor is a clamp constant, not a shift of the register steps.** `BODY_SCALE_MIN = 0.735` (0.49 × 1.5). The register steps 0.7 / 1.0 / 1.3 stay. The visual checkpoint may switch to shifting the steps; the constant lives in one place either way.
3. **`scaleBias` leaves the shape contract.** With `appendageLength` deleted, `ShapeParams` would be `{ torsoAspect, scaleBias }`; the floor clamp needs the *product* of register scale and bias, which a shape cannot clamp from two props. So `RobotBody` computes the final body scale and passes it as `scale`; shapes apply `scale` alone; `ShapeParams` becomes `{ torsoAspect }`.
4. **Shapes scale about the body centre, not the origin.** The root transform becomes `translate(48,36) scale(s) translate(-48,-36)` so the body's centre stays at (48,36) at every size. Both avatars then frame the body with `viewBox="-40 -52 176 176"` (centred on 48,36, Crawford: widen — §7 Q3 closed 2026-10-03) so the largest body (1.69 × 96 = 162 units) sits inside with margin. In the world the body at scale 1 is pixel-identical; at other scales it moves by `(48(1−s), 36(1−s))` relative to today, which no system reads (no robot-size constant exists in `robotSystems.ts`/`constants`).
5. **Highlight and shadow are hue-shifted, not plain lighten/darken of primary.** Highlight uses the secondary hue (+14°) with lightness raised; shadow uses the accent hue (−22°) with lightness lowered — the usual flat-shading trick, and it finally consumes `secondary`. Opacities stay what each shape uses today.
6. **The lamp has a brightness floor.** `lampOpacity = (LAMP_MIN + (1 − LAMP_MIN) × intensity) × dimOpacity`, `LAMP_MIN = 0.4`. Raw intensity bottoms out at 0.12 (gain 0.2 × 0.6 + detail 0), which would hide the identity carrier on a quiet, short-release robot. Battery dim still multiplies through, so a critical battery (0.1) still kills it.
7. **The window and lamp are not day/night-affected.** They are fixed-colour elements today and `lightnessMultiplier` never touched them; identity colour keeps that — a robot's window reads the same hue at midnight and noon, which is the point.
8. **Greeble computations stay as they are, still unrendered.** `calculateGreebleCount/Size/Persistence/PlacementBias` and `calculateDetailLevel(filterFreq)` remain, fed live, consumed by nothing; branch 2 owns them. Only the `mapped.greebleProps` preference goes.

---

## 1. Overview & Claude Explanation

### 1.1 Delete the snapshot; compute the three body params live

- `AudioAttributes.visualAudioMap` is removed from `src/types/Robot.ts`. In `src/types/layeredAudio.ts`, `ShapeParams`, `LayerVisual` and `VisualAudioMap` are deleted; `OscillatorLayer` stays. `src/types/index.ts` is `export * from './layeredAudio'`, so nothing to edit there.
- `src/components/robot/robotVisualMapper.ts` and its test are deleted.
- `spawnSystem.ts` stops building the snapshot: the `visualAudioMap` block (`:290-340`) and `ADSR_MAX` go. The three spawn tests that assert on it move to `robotVisualHelpers.test.ts` against the new helper (same deterministic inputs, same expected numbers under the new normaliser — see §5).
- New in `robotVisualHelpers.ts`:

  ```ts
  /** Normalises the shared envelope into 0..1 body params. Matches the seeded generation range
   *  (spawnSystem's ATTACK_RANGE/RELEASE_RANGE max 5 s); edits past it clamp. */
  export const BODY_NORMALISER = { attack: 5, sustain: 1, release: 5 } as const;

  export interface BodyShape {
    scale: number;     // 0..1 — snappier attack → bigger body
    roundness: number; // 0..1 — sustain → torso aspect
    detail: number;    // 0..1 — release → detail cliff
  }

  export function bodyShapeFromAdsr(adsr: ADSREnvelope): BodyShape {
    return {
      scale: clamp01(0.25 + (1 - adsr.attack / BODY_NORMALISER.attack) * 0.75),
      roundness: clamp01(adsr.sustain / BODY_NORMALISER.sustain),
      detail: clamp01(adsr.release / BODY_NORMALISER.release),
    };
  }
  ```

- `RobotBody.tsx`'s memo calls `bodyShapeFromAdsr(adsr)` where it used `mapped.bodyShapeProps`, and keeps its existing 70/30 `torsoAspect` blend (ADSR roundness vs register). The memo's dependency array stays `[robot.audioAttributes, robot.octaveRange]`; `robot.identityColor` and `robot.batteryLevel` are read outside it (they are not audio).

### 1.2 Release drives the detail cliff

`detailLevel = bodyShape.detail` — release / 5, so the `.details` group (vent, panel lines, warning stripes) appears when release > 2.5 s. The `?? calculateDetailLevel(filterFreq)` fallback is removed from the detail-level line; `calculateDetailLevel` itself stays for `calculateGreebleCount` (assumption 8). The shapes' `detailLevel > 0.5` test is unchanged.

### 1.3 Body scale: live, floored, applied once

```ts
export const BODY_SCALE_MIN = 0.735; // 1.5 × the pre-Phase-36 floor of 0.49 (Crawford, 2026-10-03)

/** Final body scale: register step × attack-driven bias, floored. */
export function calculateBodyScale(octaveRange: [number, number], bodyScale01: number): number {
  const bias = Math.max(-0.4, Math.min(0.4, (bodyScale01 - 0.5) * 0.6));
  return Math.max(BODY_SCALE_MIN, calculateScale(octaveRange) * (1 + bias));
}
```

- `RobotBody` passes `scale={calculateBodyScale(octaveRange, bodyShape.scale)}`.
- `ShapeParams` becomes `{ torsoAspect: number }`; `appendageLength` and `scaleBias` are deleted from the interface in `robotVisualHelpers.ts` and from the four shapes' local prop types. `shapeParamsFromAudio` returns `{ shapeParams: { torsoAspect }, microVariants }` (the dead `appendageLength`/`scaleBias` arithmetic goes; `microVariants` stays, still unread).
- Each shape's root becomes `<g transform={`translate(48,36) scale(${scale}) translate(-48,-36)`}>` with the `scale(${torsoAspect},1)` group inside unchanged (assumption 4).
- Both avatars change `viewBox` to `-40 -52 176 176`.

### 1.4 Shading from the robot's own colours

`RobotColors` gains two fields; `generateColors` fills them; `applyLightnessMultiplier` maps all five.

```ts
export interface RobotColors {
  primary: string;
  secondary: string;
  accent: string;
  highlight: string; // secondary hue, lightness +25 (cap 95) — replaces the fixed #a9adb0
  shadow: string;    // accent hue, lightness −25 (floor 5)  — replaces the fixed #000000
}
```

In every shape, the highlight fill(s) become `colors.highlight` and the shadow fill(s) `colors.shadow`; the per-shape opacities are untouched (Sleek/Angular/Industrial 0.6/0.3, Organic 0.5/0.2). Rivets and vent greys stay fixed — they are "hardware", not body paint, and are out of scope.

### 1.5 Window glass carries the identity colour

- `RobotSVGProps` gains `identityColor: string` (hex). `RobotBody` passes `robot.identityColor`.
- A small helper in `robotVisualHelpers.ts`, `identityGlass(hex)`, returns `{ glass: hex, sheen: hslToString({ ...hexToHsl(hex), l: min(95, l + 20) }) }` — reuses `colorUtils`' `hexToHsl`/`hslToString`.
- In each shape the window group becomes `<g className="window" opacity={dimOpacity}>`: outer element `fill={glass}` (opacity as today, 0.8), inner sheen `fill={sheen}` (0.6), Organic's third highlight `fill={sheen}` (0.8). `#78cce2`, `#b3e5f2`, `#e0ffff` disappear from the shapes.
- `RobotBody.test.tsx`'s window selector changes from `ellipse[fill="#78cce2"]` to `g.window`.

### 1.6 One lamp on every shape, always visible, identity-coloured

- `RobotSVGProps` gains `lampOpacity: number`. `RobotBody` computes it outside the memo (battery is not audio) from a memoised `lampIntensity`:

  ```ts
  export const LAMP_MIN = 0.4;

  /** Averaged audible-layer gain (gain !== 0; 1 if none — spawnSystem's own rule) blended with
   *  detail. Gains are seeded 0.2..1.2, so the blend is clamped. */
  export function calculateLampIntensity(layers: OscillatorLayer[] | undefined, detail: number): number {
    const audible = (layers ?? []).filter((l) => l.gain !== 0);
    const averagedGain = audible.length > 0 ? audible.reduce((s, l) => s + l.gain, 0) / audible.length : 1;
    return clamp01(averagedGain * 0.6 + detail * 0.4);
  }

  // RobotBody, outside the memo:
  const lampOpacity = (LAMP_MIN + (1 - LAMP_MIN) * audioVisual.lampIntensity) * dimOpacity;
  ```

- Each shape renders `<g className="lamp" opacity={lampOpacity}>` **outside** the `.details` group, so it is present at every detail level: a `glass`-filled lamp with a `sheen` core. The green `#39ff14`/`#a2ff8a` lights are deleted. Proposed placements in the 96×72 body space, to be tuned by eye at the checkpoint:

  | Shape | Lamp | Notes |
  |---|---|---|
  | Sleek | circle (70,36) r 3.5 + core (70,35) r 2 | rear-centre, clear of the vent (x ≤ 60) and the x = 60 panel line |
  | Angular | circle (73,36) r 3 + core (73,35) r 1.8 | between the vent (x ≤ 68) and the rear vertex (80,36) |
  | Organic | circle (60,24) r 3.5 + core (60,23) r 2 | the old status-light spot, now outside `.details` |
  | Industrial | housing rect (76,28,8×16) `#818589` stays fixed and *outside* the lamp group; light rect (78,32,4×8) + core (78,32,4×4) inside it | moved out of `.details` together |

- Muting a layer lowers `lampIntensity` live because `layers` is in the memo's `audioAttributes` dependency.

### 1.7 The guardrail amendment (one commit, four places)

- `CLAUDE.md:49` and `.github/copilot-instructions.md:43`, identical text:
  > Visual Mapping: "Robot visuals (shape/color) must map strictly to audio attributes (synth/ADSR/phase/detune) as defined in ROBOT_DESIGN.md — with one documented non-audio identity layer: `Robot.identityColor` on the window glass and lamp only (ROBOT_DESIGN.md 'Identity layer'), the same class of exception as the day/night and battery brightness overlays."
- `docs/ROBOT_DESIGN.md` "Forbidden Patterns": the "static/fixed color palette" line becomes "Adding a static/fixed color palette to the **body** — body colours must stay derived from ADSR + waveform; the only non-audio colour is `identityColor`, confined to window glass and lamp (see 'Identity layer')." A new "Identity layer" section documents the carve-out and its two elements.
- `src/types/Robot.ts` `identityColor` comment: "one of the 18 `ROBOT_IDENTITY_COLOR_NAMES` hues, seeded at spawn — UI chrome (RobotSelectionCard/RobotDisplaySection) **and** the SVG body's window glass + lamp, nothing else on the body (docs/ROBOT_DESIGN.md 'Identity layer'); the body's own fills stay ADSR/waveform-derived." The spawn helper's "13 hue keys" doc line is fixed to 18 in the same commit.

### 1.8 What does not change

`generateColors`' hue/saturation/luminance formulas; `calculateScale`'s register steps; the 70/30 torso blend; battery-dim thresholds and `computeBatteryDimOpacity`; the day/night curve and the item-22 memo split; rivet and vent greys; `.details` threshold and contents (minus the lights); greeble helpers; `swimAnimation.ts`; the robot card chrome; `getRobotColorStyle`; session storage and share links; `AudioEngine`.

## 2. Target File Structure

```
src/components/robot/
  RobotBody.tsx                 edit — live body params, body scale, identityColor + lampOpacity props
  RobotSleek.tsx                edit — centre-scaled root, highlight/shadow, window, lamp; props type
  RobotAngular.tsx              edit — same
  RobotOrganic.tsx              edit — same (status light → lamp, out of .details)
  RobotIndustrial.tsx           edit — same (housing stays; light → lamp, out of .details)
  robotVisualHelpers.ts         edit — BODY_NORMALISER, bodyShapeFromAdsr, BODY_SCALE_MIN,
                                       calculateBodyScale, LAMP_MIN, calculateLampIntensity,
                                       identityGlass, RobotColors +highlight/+shadow, ShapeParams
                                       trimmed, shapeParamsFromAudio trimmed; darken() deleted if unused
  robotVisualMapper.ts          DELETE
  robotVisualMapper.test.ts     DELETE
  RobotBody.test.tsx            edit — window selector, new live-edit + lamp tests
  robotShapeVariants.test.tsx   edit — fixture, transform strings, window/lamp/colour assertions
  robotVisualHelpers.test.ts    edit — migrated snapshot tests + new helper tests
  RobotDisplaySection.tsx       edit — viewBox
src/components/selection/
  RobotSelectionCard.tsx        edit — viewBox
src/systems/
  spawnSystem.ts                edit — snapshot block + ADSR_MAX removed; "13" → "18" doc fix
  spawnSystem.test.ts           edit — three snapshot tests removed (migrated)
src/types/
  Robot.ts                      edit — visualAudioMap removed; identityColor comment
  layeredAudio.ts               edit — ShapeParams/LayerVisual/VisualAudioMap removed
  index.ts                      no change — `export *` picks up the trimmed module
CLAUDE.md, .github/copilot-instructions.md   edit — guardrail line
docs/ROBOT_DESIGN.md            rewrite of Shape Parameters / Greebles & Lights / Forbidden Patterns; new Identity layer
docs/AUDIO_SYSTEM.md            edit — lines 195-209, 548 (no snapshot; visuals read audioAttributes live)
docs/todo/roadmap.md            add — Phase 36 entry
```

## 3. Implementation Boundaries & Constraints

- **Always:** keep every change inside the existing flat style — no gradients, filters, new outline geometry, or rim strokes. Keep `RobotBody`'s memo audio-only (identity colour, battery, daylight all read outside it); the item-22 spy test must still pass. State stays JSON-serialisable; nothing computed is stored. Run `npm run build:types`, `npm run lint`, `npm test` before every commit; one commit per task.
- **Ask first:** changing `calculateScale`'s register steps instead of (or as well as) the floor clamp; any lamp placement that moves a window or vent; touching rivet/vent greys; any change to the card chrome.
- **Never:** relax the guardrail beyond window glass + lamp; make `identityColor` audio-derived; store `RobotColors`/shape props on the robot; add a cutoff slider; add motion; add greeble rendering; alter `generateColors`' mapping.

## 4. Code Style & Architecture Conventions

- Helpers are pure, exported, named functions in `robotVisualHelpers.ts` with a one-line doc comment stating the mapping and its range; constants are `UPPER_SNAKE` with the "why" in the comment (as `BODY_SCALE_MIN` above).
- Shapes stay stateless `React.memo` components; new groups carry a `className` (`window`, `lamp`) for test selection, matching the existing `.details` convention. No inline computation of colours inside a shape — every colour arrives as a prop.
- `RobotBody` is the one composition point; shape prop types are updated in all four files identically (they are deliberately duplicated today).
- No user-facing strings are involved; the content-layer lint rule is unaffected.

## 5. Testing & Verification Requirements

Vitest + Testing Library, colocated. Every behavioural change lands RED → GREEN.

- **`robotVisualHelpers.test.ts`**
  - `bodyShapeFromAdsr`: all-zero envelope → `{ scale: 1, roundness: 0, detail: 0 }` (migrated from `spawnSystem.test.ts`); attack 5 → scale 0.25; attack 10 → scale 0.25 (clamp); release 2.5 → detail 0.5 exactly; sustain 1 → roundness 1.
  - `calculateBodyScale`: treble register + slowest attack → exactly `BODY_SCALE_MIN`; bass + fastest attack → 1.69; floor never applies above it; `BODY_SCALE_MIN` is ≥ 1.5 × 0.49.
  - `calculateLampIntensity`: all layers muted → uses the fallback 1; a muted layer is excluded from the average; result clamped to 1 for gains 1.2; detail contributes 0.4.
  - `generateColors`: `highlight` lighter than `primary`, `shadow` darker; both are `hsl(...)` strings; `applyLightnessMultiplier` scales all five fields.
  - `identityGlass`: `sheen` lightness > glass lightness; accepts every `ROBOT_IDENTITY_COLOR_NAMES` hex.
  - `ShapeParams` has no `appendageLength`/`scaleBias` (type-level: a `// @ts-expect-error` fixture).
- **`robotShapeVariants.test.tsx`** (parametrised over the four shapes)
  - fixture gains `identityColor`, `lampOpacity`, `colors.highlight/shadow`; `shapeParams: { torsoAspect: 1 }`.
  - root transform is `translate(48,36) scale(2) translate(-48,-36)` for `scale={2}`.
  - `g.window` exists, carries `opacity={dimOpacity}`, and its first fill equals `identityColor`-derived glass; no element has fill `#78cce2`.
  - `g.lamp` exists at `detailLevel={0.2}` (below the cliff) and carries `opacity={lampOpacity}`; no element has fill `#39ff14`.
  - no element has fill `#a9adb0` or `#000000`; some element has fill `colors.highlight` and some `colors.shadow`.
  - the `[opacity="1"]` dim-group test is rewritten to select `g.window` (a `lampOpacity` of 1 would otherwise collide).
  - Industrial: the `#818589` housing is present at low detail and outside `g.lamp`.
- **`RobotBody.test.tsx`**
  - live edit: two renders differing only in `adsr.attack` (0.1 vs 4) produce different root `scale(...)` values; differing only in `adsr.release` (1 vs 4) toggles `.details`; differing only in `layers[1].gain` (0 vs 1) changes `g.lamp` opacity.
  - window group fill derives from `robot.identityColor`; changing only `identityColor` changes it and nothing else in the body.
  - existing day/night, `ignoreDaylight`, battery-dim and item-22 spy tests pass with the `g.window` selector.
  - `lampOpacity` is `≥ LAMP_MIN × dimOpacity` for a full-battery robot with every layer muted, and `0.1 ×` that at critical battery.
- **`spawnSystem.test.ts`**: the three snapshot tests are removed; a new assertion that `generateAudioAttributes(...)` has no `visualAudioMap` key.
- **Type/lint gates:** `npm run build:types` must fail until `Robot.ts`/`layeredAudio.ts` are trimmed together (a deliberate RED), then pass.
- **Visual checkpoint (Crawford, by eye, `npm run dev`):** twelve robots in a world; the window hue matches each card; the lamp is visible on every robot including a quiet one; drag attack/sustain/release in Robot Options and watch size, width, detail and shading change; a muted layer dims the lamp; the smallest robot is visibly larger than before; the avatars are centred and unclipped; shading reads as "the same flat style, less grey". The two size decisions in §7 are closed here.

## 6. Git & Workflow Context

- Branch `feature/robot-rework`, `main` at `5d21cf59`. Unpushed; push/PR is Crawford's call.
- One task per commit, RED first, per [docs/CONTRIBUTION_GUIDE.md](../CONTRIBUTION_GUIDE.md) and the TDD workflow; the guardrail amendment is its own commit touching exactly the four places in §1.7.
- Attribution per the session reminder. PowerShell 5.1 gotcha: a `git commit -m @'…'@` message must not contain double quotes.
- Roadmap entry under `## 36. Robot Live Visuals` in `docs/todo/roadmap.md`, same shape as Phase 35's (About / Not Doing).

## 7. Open Questions (need Crawford before or during the plan)

1. **Normaliser change (assumption 1).** **Closed 2026-10-03: accepted** (Crawford). Attack normalises by 5 s; every robot resizes on every seed.
2. **Floor clamp vs register shift (assumption 2).** Decide at the visual checkpoint; the spec ships the clamp.
3. **Ceiling vs avatar frame (assumption 4).** **Closed 2026-10-03: widen** (Crawford). Avatar viewBox is 176 units, `-40 -52 176 176`.
4. **Hue-shifted shading (assumption 5)** vs plain lighten/darken of `primary` — a by-eye call; the spec ships hue-shifted.
5. **`LAMP_MIN` = 0.4 (assumption 6)** — tune by eye.
6. **Lamp placements (§1.6 table)** — tune by eye; any move that collides with a vent or window is an "ask first".
