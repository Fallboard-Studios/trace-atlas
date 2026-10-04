# Phase Spec: Robot Layer Markers (two always-present identity sockets, lit by layer gain)

> **Shipped (roadmap Phase 38, 2026-10-03)** — plan [docs/tasks/ROBOT_LAYER_MARKERS.md](../tasks/ROBOT_LAYER_MARKERS.md). All 7 tasks landed on `feature/robot-rework`; Crawford's Checkpoint B visual pass confirmed.

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-layer-markers.md](../intent/robot-layer-markers.md) (confirmed 2026-10-03). Series: [docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md); motion follow-up record: [docs/ideas/layer-pods-and-follow-through.md](../ideas/layer-pods-and-follow-through.md). Branch `feature/robot-rework`, after Phase 36 ([ROBOT_LIVE_VISUALS](ROBOT_LIVE_VISUALS.md)) and Phase 37 ([ROBOT_GREEBLES](ROBOT_GREEBLES.md)); Phase 37's sketch supplies the socket positions. Roadmap slot: **Phase 38**.

Survey basis (2026-10-03, against the current tree; Phases 36–37 not yet implemented, so their contracts are cited as specced):

- **Layer gain: seeded 0.2..1.2, edited 0..2.** `spawnSystem.ts:310` seeds `gain` in 0.2..1.2 on a 0.01 grid, or exactly 0 on the ~50 % quiet roll for Coaxial/Harmonic; `layers[0]` (Baseline) is never quiet. The Signature Array slider (`robotOptionsConfig.ts:362`) runs `min 0, max 2, step 0.01`. Gain 0 is the shipped mute signal (`AudioEngine.ts`'s `filterAudibleLayers`; docs/intent note on the Active-toggle removal).
- **Two live edit paths, both write `audioAttributes.layers`.** `applyLayersContinuous` (`robotOptionsActions.ts:119`) spreads a new `layers` array into `audioAttributes` via `updateRobot`; `companyOptions.ts:70+` broadcasts a single layer field onto each member's own layer. Either way `robot.audioAttributes` is a new object, which is already the dependency of `RobotBody`'s audio memo — a gain edit re-renders the body today.
- **`layers` is optional on the type** (`AudioAttributes.layers?: OscillatorLayer[]`, `Robot.ts:74`) and guarded with `?.[0]` wherever read (`RobotBody.tsx:74`, `AudioEngine.ts:255/808`). Test fixtures routinely omit it.
- **Lamp pattern from Phase 36** (the thing a socket copies): `identityGlass(hex) → { glass, sheen }`; `lampOpacity = (LAMP_MIN + (1 − LAMP_MIN) × intensity) × dimOpacity` computed in `RobotBody` *outside* the memo; rendered as `<g className="lamp" opacity={lampOpacity}>` after the window, outside `.details`; `LAMP_MIN = 0.4`.
- **Fixtures module from Phase 37**: `src/components/robot/greebleSlots.ts` holds `FIXTURE_BOXES` per shape; its sketch task reserves two socket positions per shape and enters them as fixtures. The sockets themselves render in this phase.
- **Avatars after Phase 36**: both use `viewBox="-40 -52 176 176"`; `RobotSelectionCard` passes `ignoreDaylight` (and, after Phase 37, `hideGreebles`); `RobotDisplaySection` passes `ignoreDaylight` only.
- **Guardrail text after Phase 37** names two non-audio layers: identity colour (window glass + lamp) and the seeded greeble set.

ASSUMPTIONS I'm making beyond the intent (correct now or I'll proceed with these):

1. **Brightness normalises by the seeded max (1.2), clamped above** — the same ruling Phase 36 took for size (§7 Q1): the seeded population spans the whole visual range; a slider push past 1.2 is fully lit, not brighter.
2. **Constants:** `SOCKET_DARK = 0.15` (muted glass, housing still visible), `SOCKET_MIN = 0.4` (matches `LAMP_MIN`), `SOCKET_GAIN_MAX = 1.2`. Tune by eye.
3. **A missing layer is a muted layer.** `layers` undefined or shorter than three → that socket is dark. A socket is never omitted.
4. **One small node component, like the greebles**, not two more opacity props on every shape: `<RobotLayerSockets>` renders `g.sockets` with `g.socket.socket--coaxial` and `g.socket.socket--harmonic`; shapes take it as `sockets?: React.ReactNode` and place it right after the lamp group.
5. **Socket geometry:** housing ring r 3 (`colors.shadow`, stroke only, so it survives any body colour), glass r 2.2 (`glass`), sheen r 1.1 offset up (`sheen`) — three elements per socket, six per robot. Sockets are smaller than the lamp (r 3.5) so the lamp stays the primary identity carrier.
6. **Socket positions live in `greebleSlots.ts`** as `SOCKET_POSITIONS: Record<WaveformType, readonly [Pos, Pos]>` beside `FIXTURE_BOXES`, since they are the same hand-measured data. Pulse = sine.
7. **Day/night does not touch sockets**, consistent with the window and lamp.
8. **Both avatars show sockets** (intent: "shown"); no hide prop.

---

## 1. Overview & Claude Explanation

### 1.1 Brightness

```ts
// robotVisualHelpers.ts
export const SOCKET_DARK = 0.15;
export const SOCKET_MIN = 0.4;
export const SOCKET_GAIN_MAX = 1.2;

/** Glass opacity for one layer socket before battery dim. gain 0 (or no layer) → dark socket. */
export function socketLitOpacity(gain: number | undefined): number {
  if (!gain) return SOCKET_DARK;
  return SOCKET_MIN + (1 - SOCKET_MIN) * clamp01(gain / SOCKET_GAIN_MAX);
}
```

`RobotBody` derives `socketLit: [number, number]` **inside** the audio memo (it depends only on `layers`), then outside the memo `socketOpacities = socketLit.map((o) => o * dimOpacity)` — the lamp's split, one line.

### 1.2 Positions

```ts
// greebleSlots.ts (Phase 37 module; created here if Phase 37 has not landed)
export interface Pos { x: number; y: number }
/** Coaxial, Harmonic — hand-measured in docs/sketches/robot-greebles.html; also in FIXTURE_BOXES. */
export const SOCKET_POSITIONS: Record<WaveformType, readonly [Pos, Pos]> = { sine: [...], square: [...], triangle: [...], sawtooth: [...], pulse: /* sine */ };
```

A test asserts each socket's r-3 box is contained in that shape's `FIXTURE_BOXES` (so greebles cannot land on it) and does not intersect the window, lamp or vent boxes.

### 1.3 Renderer

```tsx
// RobotLayerSockets.tsx
export const RobotLayerSockets = memo(function RobotLayerSockets({ positions, opacities, glass, sheen, housing }: Props) {
  return (
    <g className="sockets">
      {positions.map((p, i) => (
        <g key={i} className={`socket socket--${i === 0 ? 'coaxial' : 'harmonic'}`} transform={`translate(${p.x},${p.y})`}>
          <circle r={3} fill="none" stroke={housing} strokeWidth={1} />
          <g opacity={opacities[i]}>
            <circle r={2.2} fill={glass} />
            <circle cy={-0.6} r={1.1} fill={sheen} />
          </g>
        </g>
      ))}
    </g>
  );
});
```

The housing ring is **outside** the opacity group: a dark socket is still a visible fixture. `housing = colors.shadow`.

### 1.4 Wiring

- `RobotSVGProps` (four shapes) gains `sockets?: React.ReactNode`, rendered immediately after `g.lamp` and before `.details`.
- `RobotBody` builds `<RobotLayerSockets positions={SOCKET_POSITIONS[waveform]} opacities={socketOpacities} glass sheen housing={colors.shadow} />` and passes it on every render context (card, detail, world).

### 1.5 Guardrail amendment (one commit, four places)

`CLAUDE.md` / `.github/copilot-instructions.md`: "… `Robot.identityColor` on the window glass, lamp and the two layer sockets …". `docs/ROBOT_DESIGN.md` "Non-audio layers": identity colour's element list becomes three, with the note that a socket's *lit state* is audio (gain) and only its hue is identity. `Robot.ts` `identityColor` comment lists the three.

### 1.6 What does not change

The lamp's own brightness (averaged audible gain blend), greebles, body colours/scale, the release cliff, battery thresholds, day/night, swim animation, card chrome, `AudioEngine`, session/share formats (nothing new persisted).

## 2. Target File Structure

```
src/components/robot/
  RobotLayerSockets.tsx          NEW — renderer
  RobotLayerSockets.test.tsx     NEW
  greebleSlots.ts                edit — SOCKET_POSITIONS (+ fixture containment)
  greebleSlots.test.ts           edit — socket boxes inside FIXTURE_BOXES, clear of window/lamp/vent
  robotVisualHelpers.ts          edit — SOCKET_* constants, socketLitOpacity
  robotVisualHelpers.test.ts     edit
  RobotSleek/Angular/Organic/Industrial.tsx  edit — `sockets` prop after the lamp
  robotShapeVariants.test.tsx    edit — DOM order; absent when omitted
  RobotBody.tsx                  edit — socketLit in memo, opacities outside, node built
  RobotBody.test.tsx             edit
src/types/Robot.ts               edit — identityColor comment (three carriers)
CLAUDE.md, .github/copilot-instructions.md, docs/ROBOT_DESIGN.md   edit — three carriers
docs/todo/roadmap.md             add — Phase 38
docs/ideas/layer-pods-and-follow-through.md   edit — header: static half shipped; motion remains
```

## 3. Implementation Boundaries & Constraints

- **Always:** exactly two sockets per robot in every render; housing ring outside the opacity group; three elements per socket max; `socketLit` audio-only inside the memo, battery outside (item-22 split survives); `npm run build:types`, `npm run lint`, `npm test` before every commit.
- **Ask first:** a socket for the Baseline layer; any mapping from detune/phase; moving a socket position after the Phase 37 sketch signed it; hiding sockets on the card.
- **Never:** remove a socket on gain 0; animate; store socket state; make the hue audio-derived; use `requestAnimationFrame`/timers.

## 4. Code Style & Architecture Conventions

Same split as the lamp and the greebles: helper computes a number, `RobotBody` composes, a draw-only memo component renders, shapes place a node. Class names `sockets`, `socket`, `socket--coaxial`, `socket--harmonic` for tests. No colour computed inside the renderer.

## 5. Testing & Verification Requirements

- **`robotVisualHelpers.test.ts`:** `socketLitOpacity(0)` and `(undefined)` → `SOCKET_DARK`; `(1.2)` → 1; `(2)` → 1 (clamp); `(0.2)` → `SOCKET_MIN + 0.6 × (0.2/1.2)`; monotonic over 0.01..1.2.
- **`greebleSlots.test.ts`:** every waveform key has exactly two positions; each socket box ⊂ `FIXTURE_BOXES` for that shape; no intersection with window, lamp, vent boxes.
- **`RobotLayerSockets.test.tsx`:** always two `.socket` with the two modifier classes and `translate` equal to positions; housing ring has `fill="none"` and is not inside the opacity group; the opacity group carries the given opacities; ≤ 3 elements per socket.
- **`robotShapeVariants.test.tsx`:** `sockets` node renders after `g.lamp` and before `.details` (DOM order); none when omitted.
- **`RobotBody.test.tsx`:** two sockets with `layers` undefined (both dark); `layers[1].gain` 0 vs 1 changes only the coaxial opacity; critical battery multiplies both by 0.1; changing only `identityColor` changes socket glass fill and nothing else; the item-22 spy test passes; `RobotSelectionCard` and `RobotDisplaySection` renders each contain two `.socket`.
- **Visual checkpoint (Crawford):** at a glance, robots with 0 / 1 / 2 lit sockets are distinguishable at world scale and on cards; a dark socket reads as a fixture, not a hole; dragging a layer gain relights its socket live; a company broadcast of gain relights every member; sockets match the card colour.

## 6. Git & Workflow Context

- `feature/robot-rework`, after Phase 37's checkpoint. One commit per task; the guardrail amendment its own commit. PowerShell 5.1: no double quotes inside `-m @'…'@`.
- Roadmap `## 38. Robot Layer Markers`; the pods one-pager's header is updated to "static half shipped, motion remains".

## 7. Open Questions (need Crawford before or during the plan)

1. **`SOCKET_DARK` 0.15 / `SOCKET_MIN` 0.4** (assumption 2) — tune by eye.
2. **Socket size r 3 vs lamp r 3.5** (assumption 5) — by eye; the lamp should stay dominant.
3. **Normalise by 1.2, clamp above** (assumption 1) — confirm, same as Phase 36 Q1.
4. **Three elements per socket** (six per robot) — fine for paint? The greeble perf gate precedes this; if it was tight, drop the sheen (two per socket).
