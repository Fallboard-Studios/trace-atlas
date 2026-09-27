# Phase Spec: LFO Integration (Roadmap Phase 0)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/lfo-integration.md](../intent/lfo-integration.md) (confirmed via `/interview-me`). Source of scope: [docs/todo/roadmap.md § 0](../todo/roadmap.md#0-lfo-integration). Source of target data: [docs/reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md), [docs/reference/GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md).

---

## 1. Overview & Claude Explanation

This phase builds the Tone.js LFO signal-modulation core and wires it to every parameter the reference grids flag `Has LFO`, before any UI exists. We are creating `src/types/lfo.ts` to define LFO modulation-target ids, oscillator shapes (Triangle, Sine, Square, Sawtooth), and Hz rate bounds; `src/engine/lfoEngine.ts`, alongside the existing `AudioEngine`/`beatClock` modules, implements real Tone.js `LFO` node lifecycle plus pure getter/setter utilities (`getLfoSettings`, `setLfoRate`, `setLfoDepth`, `setLfoShape`, `connectLfoTarget`, `disconnectLfoTarget`) that connect into live Tone `Signal`/`Param` objects on both per-robot oscillator layers and the global FX chain — 13 targets per robot (Volume + each of 3 layers' Gain/Detune/Phase/Interval) and 9 global-chain targets (EQ low/mid/high, LPF freq/Q, HPF freq/Q, Chorus delayTime, Delay delayTime). LFO rate is a free-running Hz value; the transport only gates start/stop, it does not tempo-sync the rate. Because this phase also expands seed generation to cover *all* of `GlobalAudioSettings` (not just the LFO-flagged fields) — sampled from the planet noise map for the first time, rather than the locale maps everything else uses — we are adding `src/utils/globalAudioSeed.ts` to generate deterministic per-planet values for all 7 global effects with per-field min/max and log/linear scale referenced against Tone.js's own documented ranges, and wiring that generation live into `audioStore` in place of the static `DEFAULT_GLOBAL_AUDIO_SETTINGS`. Robot-level LFO settings (shape/rate/depth per target) generate through `spawnSystem.ts`'s existing locale-seeded `getSeededVal` pattern, matching how the rest of a robot's `AudioAttributes` are generated. All 7 global effects' `enabled` flags are forced `true` for this phase (not seeded) so the fully-seeded chain is audible for evaluation by ear — there is no LFO UI yet, so verification is unit tests plus a temporary manual/debug hook, not a drawer.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── lfo.ts                    # NEW — LFO shape/target/rate types, LfoSettings interface
│   ├── layeredAudio.ts           # MODIFIED — OscillatorLayer/voice interfaces accept modulation inputs
│   └── globalAudio.ts            # MODIFIED — add per-field seed range/scale metadata alongside DEFAULT_GLOBAL_AUDIO_SETTINGS
├── data/
│   └── lfoConfig.ts              # NEW — default LfoSettings per target, target-id registry
├── engine/
│   ├── lfoEngine.ts              # NEW — Tone.LFO lifecycle + getters/setters + connect/disconnect
│   ├── lfoEngine.test.ts         # NEW
│   └── AudioEngine.ts            # MODIFIED — expose modulatable Signal/Param refs (per-voice layers + global FX chain) for lfoEngine to connect to
├── utils/
│   ├── globalAudioSeed.ts        # NEW — generateGlobalAudioSettings(planetId, planetName): GlobalAudioSettings, sampled from the planet noise map
│   └── globalAudioSeed.test.ts   # NEW
├── systems/
│   └── spawnSystem.ts            # MODIFIED — generate per-robot LfoSettings for the 13 robot-level targets alongside existing AudioAttributes generation
├── utils/
│   └── localeHelpers.ts          # MODIFIED — getActiveLocaleId() uses selectCurrentPlanet() instead of planets[0]
├── components/
│   ├── robot/Robot.tsx                                    # MODIFIED — planets[0] → currentPlanetId lookup
│   ├── actors/Factory.tsx                                 # MODIFIED — planets[0] → currentPlanetId lookup
│   └── panels/screen/
│       ├── RobotList.tsx                                  # MODIFIED — planets[0] → currentPlanetId lookup
│       ├── TransportBar.tsx                                # MODIFIED — planets[0] → currentPlanetId lookup
│       ├── worldView/OceanScene.tsx                        # MODIFIED — planets[0] → currentPlanetId lookup
│       └── console/
│           ├── RobotOscillatorsTab.tsx                    # MODIFIED — planets[0] → currentPlanetId lookup
│           └── RobotOptionsTab.tsx                         # MODIFIED — planets[0] → currentPlanetId lookup
├── App.tsx                       # MODIFIED — planets[0] → currentPlanetId lookup
├── engine/
│   └── harmonySystem.ts          # MODIFIED — doc comment referencing planets[0] updated to currentPlanetId
└── stores/
    ├── audioStore.ts             # MODIFIED — action to replace `globalAudio` with seeded values on planet load
    └── planetStore.ts            # MODIFIED — add `currentPlanetId` + `setCurrentPlanetId` action, plus an exported `selectCurrentPlanet(state)` selector so the 9 call sites below share one lookup instead of duplicating `planets.find(...)`

docs/
└── AUDIO_SYSTEM.md               # MODIFIED — new "LFO Modulation" section documenting lfoEngine.ts's API
```

Trigger site for "regenerate global audio for the active planet" is `planetStore.ts`'s new `currentPlanetId`/`setCurrentPlanetId` (§ 7) — call `generateGlobalAudioSettings` and push the result into `audioStore` wherever `setCurrentPlanetId` is invoked, the same way `dayStartTimestamp` is already computed inline in `addPlanet`.

**Note on scope:** the 9-call-site cleanup (replacing every hardcoded `planets[0]` with `currentPlanetId`) is pure groundwork for correctness — it has no visible behavior change today (there is currently only ever one planet in play), but it removes a latent multi-planet bug and is a prerequisite for `currentPlanetId` to mean anything real. Each file gets a one-line selector swap, not a rewrite.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in the Target File Structure above unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No invented ranges:** Every LFO target's min/max/depth range must trace to [ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md) / [GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md). Every seeded global-effect field's min/max and log-vs-linear sampling scale must trace to Tone.js's own documented parameter ranges (cite the source in a code comment) cross-checked against `GLOBAL_CHAIN_GRID.md`'s existing Logarithmic/linear UI column — do not invent bounds ad hoc.
* **No Tone objects outside `src/engine/`** (per [CLAUDE.md](../../CLAUDE.md)) — `lfoEngine.ts` and `AudioEngine.ts` are the only files that may `import * as Tone`/construct Tone nodes.
* **No timers for musical timing** — the transport gates LFO start/stop only; LFO rate stays a plain Hz value, never a tempo-synced note division.
* **State stays serializable** — `LfoSettings` (shape/rate/depth/target) is Zustand-safe JSON; the live `Tone.LFO` node instance itself is runtime-only and must never enter Zustand, matching the existing voice/timeline pattern.
* **`enabled` stays pinned:** All 7 global effects are forced `true` for this phase — do not seed or randomize `enabled`.
* **No UI work this phase** — no sliders, drawers, or components. A temporary console/dev-only hook for manual auditioning is acceptable but must not be mistaken for real UI (Phases 1/4/9 own that).
* **Lazy LFO instantiation** — do not eagerly construct a `Tone.LFO` for all 13 robot targets × up to `MAX_ROBOTS` at spawn; only construct one when a target is actually bound via `connectLfoTarget`, to protect the audio thread's headroom.
* **`currentPlanetId` rollout is a selector swap only** — the 9 consumer files get their `planets[0]` read replaced by `selectCurrentPlanet(state)`; do not otherwise touch unrelated logic in those files while there.

---

## 4. Code Style & Architecture Conventions

`lfoEngine.ts` follows the existing `AudioEngine.ts` pattern — a plain exported object, no class, no Tone import anywhere else in the tree:

```typescript
// src/engine/lfoEngine.ts
import * as Tone from 'tone';
import type { LfoSettings, LfoShape, LfoTargetId } from '../types/lfo';
import { DEFAULT_LFO_SETTINGS } from '../data/lfoConfig';

const activeLfos = new Map<LfoTargetId, Tone.LFO>();

export const lfoEngine = {
  getLfoSettings: (targetId: LfoTargetId): LfoSettings =>
    settingsByTarget.get(targetId) ?? DEFAULT_LFO_SETTINGS[targetId],

  setLfoRate: (targetId: LfoTargetId, hz: number): void => {
    const lfo = activeLfos.get(targetId);
    if (lfo) lfo.frequency.value = hz;
    updateSettings(targetId, { rate: hz });
  },

  connectLfoTarget: (targetId: LfoTargetId, signal: Tone.Signal<any> | Tone.Param<any>): boolean => {
    const lfo = activeLfos.get(targetId) ?? createLfo(targetId);
    lfo.connect(signal);
    return true;
  },

  disconnectLfoTarget: (targetId: LfoTargetId): void => {
    activeLfos.get(targetId)?.disconnect();
  },
};
```

`src/data/lfoConfig.ts` follows the `globalAudio.ts` settings-interface + paired `DEFAULT_*` const pattern already used for `GlobalAudioSettings`/`DEFAULT_GLOBAL_AUDIO_SETTINGS` — every target gets a typed default, no magic numbers inline.

`planetStore.ts`'s new selector follows plain-function export, no new abstraction layer:

```typescript
// src/stores/planetStore.ts
export function selectCurrentPlanet(state: PlanetStore): Planet | undefined {
  return state.planets.find((p) => p.id === state.currentPlanetId);
}
```

```typescript
// consumer call sites (e.g. App.tsx, Robot.tsx, ...) — before/after
const localeId = usePlanetStore((s) => s.planets[0]?.currentLocaleId ?? '');       // before
const localeId = usePlanetStore((s) => selectCurrentPlanet(s)?.currentLocaleId ?? ''); // after
```

* **Naming Conventions:**
  * Engine modules: camelCase, verb-first exports (`getLfoSettings`, `setLfoRate`) matching `AudioEngine.ts`'s existing surface.
  * Types & Interfaces: PascalCase (`LfoSettings`, `LfoTargetId`).
  * Data Configs: camelCase (`lfoConfig.ts`, `globalAudioSeed.ts`).
* **Formatting:** No class-based engines (matches `AudioEngine`/`beatClock`'s plain-object/named-export style), explicit typed function signatures, module-scoped `Map`s for runtime-only state (never Zustand) — same pattern as `noiseMaps.ts`'s registry.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest.
* **Test File Location:** Colocate unit tests alongside implementation (`lfoEngine.ts` → `lfoEngine.test.ts`, `globalAudioSeed.ts` → `globalAudioSeed.test.ts`).
* **Coverage targets specific to this phase:**
  1. `lfoEngine.test.ts` — signal scaling (rate/depth clamped to grid-defined bounds), getter/setter round-trips, `connectLfoTarget`/`disconnectLfoTarget` are idempotent and don't throw when called out of order or on a missing target, lazy instantiation (no `Tone.LFO` constructed until first connect).
  2. `globalAudioSeed.test.ts` — determinism (same planet name → identical `GlobalAudioSettings` every call), values respect each field's documented min/max, log-scaled fields (e.g. filter frequency) produce a log-distributed rather than linear-skewed spread.
  3. `spawnSystem.test.ts` (existing file, extend) — generated robot `LfoSettings` are deterministic per locale seed, matching the existing assertions already made for other `AudioAttributes`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual/audible check (no UI yet): a temporary dev-console hook confirms at least one robot-layer target and one global-chain target are audibly modulating once connected, per the confirmed intent's "should at least be able to hear it" success criterion.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch:** `feature/LFO` (already open).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences (e.g. `Add lfoEngine with per-target Tone.LFO lifecycle`).

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan phase before implementation, not silently during coding:

1. **Phase/pulse-width modulation feasibility — verified against `AudioEngine.ts`, not hypothetical.** Checked directly against the current `createCompositeVoice`/`updateVoiceLayerParams` code (lines ~900–1109):
   - **Gain** (`Tone.Gain.gain`) and **Detune** (`synth.oscillator.detune`) are real, already-live `Signal`s — `connectLfoTarget` can `.connect()` to them as-is, no workaround needed.
   - **Phase** is applied only via a one-shot `synth.set({ oscillator: { phase } })` / plain-number fallback — Tone.js has no connectable `Signal` for oscillator phase at all. `connectLfoTarget('phase', …)` needs a manual-polling fallback (re-`.set()` on each LFO-internal tick) rather than native `.connect()`. Implement and document this divergence explicitly in `lfoEngine.ts`, don't silently no-op it.
   - **Interval (pulseWidth)** is connectable only when the layer's waveform is `'pulse'` (BURST) — `PulseOscillator.width` is a real `Signal`. `'square'` (BINARY) has **no** adjustable width in Tone.js at all, independent of anything we build, so Interval-LFO is structurally inapplicable to BINARY layers — `connectLfoTarget` should no-op (not throw) for that case, and this should be documented as expected, not a bug.
2. **`currentPlanetId` groundwork — now in scope.** `planetStore.ts` gets a `currentPlanetId` field + `setCurrentPlanetId` action this phase (defaulting to `DEFAULT_PELAGOS.id`), plus an exported `selectCurrentPlanet(state)` selector. All 9 existing call sites that hardcode `planets[0]` (`App.tsx`, `Robot.tsx`, `RobotList.tsx`, `TransportBar.tsx`, `Factory.tsx`, `OceanScene.tsx`, `RobotOscillatorsTab.tsx`, `RobotOptionsTab.tsx`, `localeHelpers.ts`) are updated to go through `selectCurrentPlanet` instead — a one-line swap per file, no behavior change today (only one planet exists in practice), but it closes a latent multi-planet bug and is what makes `currentPlanetId` meaningful rather than decorative. Also update the stale `planets[0]` reference in `harmonySystem.ts`'s doc comment (line 24) to match.
3. **Full per-field seed table for `GlobalAudioSettings`.** ~29 fields across 7 effects each need an explicit (min, max, scale) triple referenced against Tone.js's documented ranges — produce this as a table in the Plan-phase output, not invented per-field during Implement.
4. **LFO instance ceiling.** Up to 12 robots × 13 targets = up to 156 possible concurrent `Tone.LFO` nodes if every target were bound at once. Lazy instantiation (§ 3) mitigates this, but the Plan phase should size a sane practical ceiling and note it, since nothing in `MAX_POLYPHONY` currently accounts for LFO nodes.
