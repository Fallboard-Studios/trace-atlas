# Phase Spec: Robot Options (Roadmap Phase 9)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-options.md](../intent/robot-options.md) (confirmed via
`/interview-me`). Source of scope: [docs/todo/roadmap.md § 9](../todo/roadmap.md#9-robot-options).
Prior art / current architecture: [docs/UI_SHELL.md](../UI_SHELL.md),
[docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md), [docs/ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md),
[docs/ROBOT_DESIGN.md](../ROBOT_DESIGN.md), [docs/AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md),
[docs/reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md), and the immediately-prior
phase spec [docs/specs/ROBOT_SELECTION.md](ROBOT_SELECTION.md) (this phase reuses several of its
outputs directly — see § 1).

---

## 1. Overview & Claude Explanation

This phase tears out the hand-built robot editor — `RobotMetaTab.tsx`, `RobotAudioTab.tsx`, and
`RobotOscillatorsTab.tsx`, all wrapped in `RobotEditorTab.tsx`'s Radix `Tabs.Root` — and rebuilds it
as **Robot Options**: one screen, reached the same way as today (selecting a robot from
`RobotsTab`'s Phase 8 card list), scoped entirely to that robot, built from the Phase 1 primitive
library and a new `robotOptionsConfig.ts`.

**Layout.** Per `ROBOT_DATA_GRID.md`'s own structure, the screen is one flat **Robot Display**
section followed by three independently-collapsible **`AccordionContainer`** drawers — Ping
Controls, Ping Contour, Signature Array. Robot Display is *not* itself an accordion (the grid never
marks it `**DRAWER**` the way it marks the other three) — it's always-visible header content, same
as the grid's first six rows sit above the first `**DRAWER**` marker.

**Robot Display** — corrected per this phase's `/interview-me` pass (see intent doc):

- **Read-only, plain `DualLabel` rows** — Robot Name, Job Data, Battery Data (text `%`, no gauge
  widget), Docked Status. Exactly Phase 8's `RobotSelectionCard` display pattern, reused here rather
  than re-invented — this phase imports `JOB_TYPE_LABELS`, `DOCKING_STATE_LABELS`, and
  `UNASSIGNED_JOB_LABEL` from `src/data/robotSelectionConfig.ts` rather than duplicating them.
  **No job reassignment, no docking-state override** — both remain fully system-driven
  (`assignJob`/`scoreJobAffinities`, `tickRobotLifecycle`, all Phase 7) with no user-facing control
  here, and docking's existing mute-while-docked behavior is untouched.
- **Editable** — Audio Setting (`RadioButton`, 4 options: Off/Mute/Solo/Highlight — not the 3 the
  grid's prose currently lists, resolved during `/interview-me`, not carried forward as an open
  question) and the transducer pressure ratio / Volume slider
  (`SliderLinear`, 0–1, LFO-modulatable via the `'volume'` `RobotLfoTargetId`
  — `src/types/lfo.ts`).

**Ping Controls drawer** (`AccordionContainer`): Density (`Stepper`), Motif Length
(`StepperWithToggle`), Octave Range Min/Max (2× `Stepper`), Note Variance (`StepperWithToggle`), and
a Reset Melody `Button` — the direct schema-driven replacement for `RobotAudioTab`'s hand-rolled
Radix sliders/toggle-group, calling the same `regenerateMelody()`/`updateRobot()` pair it already
does.

**Ping Contour drawer** (`AccordionContainer`): Attack/Decay/Release (`SliderLog`, 0–10s edit
range) and Sustain (`SliderLinear`, 0–100%) editing **`audioAttributes.adsr`** — the robot's one
shared envelope. This is new functionality, not a re-skin: nothing today edits the shared envelope
at all (`RobotOscillatorsTab` only ever edited a *per-layer* `layer.adsr` override — three
independent envelopes, one per oscillator layer, which is the actual bug this phase corrects, not
just a UI consolidation). Per the roadmap's Removal list, per-layer ADSR overrides are deleted
entirely — `OscillatorLayer.adsr` disappears from the type, and every layer's synth envelope is
driven by this one shared value going forward. That's a real synthesis-engine change, not just a UI
change — see § 2's `AudioEngine`/`compositeVoice.ts` entries and § 4. Spawn-time random generation
is narrower than the edit range — attack/decay/release are all seeded within 0–5s (unifying
`spawnSystem.ts`'s current mismatched 2s/2s/5s per-field maxes into one flat 5s cap) — same
"generation range narrower than what a user can dial to by hand" relationship every other seeded
field in this phase already has.

**Signature Array drawer** (`AccordionContainer`): three named oscillator layers — Baseline
(`layers[0]`), Coaxial (`layers[1]`), Harmonic (`layers[2]`) — matching `ROBOT_DATA_GRID.md`'s Layer
1/2/3 rows and `src/types/lfo.ts`'s `layer0`/`layer1`/`layer2` `RobotLfoTargetId` naming. Baseline
has no Active toggle (always present, `active: true` always); Coaxial and Harmonic each get one,
backed by a new `OscillatorLayer.active: boolean` field. Turning a layer off **mutes it without
discarding its settings** — Type/Gain/Detune/Phase/etc. stay exactly as configured, ready to
resume the instant it's switched back on; `AudioEngine` simply excludes any layer with
`active: false` from the composite voice it builds (no synth node created for it at all), while the
full 3-entry array — inactive layers included — stays intact in `Robot` state for the UI to keep
reading/editing. Per layer: Type (`RadioButton`, the 5 real waveform shapes only — `'noise'` is
dropped as a selectable option, see § 3), Gain (`SliderLinear`, LFO), Detune
(`SliderCenteredZero`, ±50 cents, LFO), Phase (`SliderLinear`, LFO), and Interval/pulse width
(`SliderLinear`, LFO — shown only when Type is Burst/pulse; corrected post-launch — Tone.js's
`OmniOscillator.width` has no effect for Binary/square, only 'pulse', so the original "also show
for Binary/square" call was dropped once caught in code review). `spawnSystem.ts`
always generates exactly these 3 layers going forward (replacing today's 1–4 dynamic range and the
`'noise'` type entirely) — Coaxial/Harmonic are each independently seeded active or inactive, and
robot-level LFO targets (including Volume) are each independently seeded active or inactive too,
consistent with how the global Audio Rig chain already seeds its own LFOs per planet.

Every control in every drawer composes its own `DualLabel` internally (per
`COMPONENT_LIBRARY.md`'s composition rule) — `robotOptionsConfig.ts` supplies the `loreLabel`/
`humanLabel` pair on each schema entry, field-for-field from `ROBOT_DATA_GRID.md`, the same way
`audioRigConfig.ts` traces to `GLOBAL_CHAIN_GRID.md`. Live wiring reads/writes
`useLocaleStore`'s `updateRobot()` directly (no new store needed), calling into `AudioEngine`
wherever a change needs to reach live synthesis — mirroring `RobotOscillatorsTab`'s existing
`commitContinuous`/`commitStructural` split (continuous params update live without re-reservation;
structural changes — layer type, layer count/activation — call `AudioEngine.reReserveVoice`).

---

## 2. Target File Structure

```text
src/
├── components/
│   ├── robot/
│   │   ├── RobotDisplaySection.tsx        # NEW — the always-visible header block (not an
│   │   │                                  #   AccordionContainer). Renders read-only Name/Job/
│   │   │                                  #   Battery(%)/Docking DualLabel rows (reusing
│   │   │                                  #   robotSelectionConfig.ts's label maps — no
│   │   │                                  #   duplication), plus editable Audio Setting
│   │   │                                  #   (RadioButton, 4 options) and Volume (SliderLinear +
│   │   │                                  #   nested Lfo accordion, same param-row pattern
│   │   │                                  #   AudioRigDrawer.tsx already uses for eq3.low etc.)
│   │   ├── RobotDisplaySection.css        # NEW
│   │   ├── RobotDisplaySection.test.tsx   # NEW — see § 5
│   │   ├── PingControlsDrawer.tsx         # NEW — one AccordionContainer wrapping Density/Motif
│   │   │                                  #   Length/Octave Range/Note Variance/Reset Melody.
│   │   │                                  #   Wires to regenerateMelody() exactly as
│   │   │                                  #   RobotAudioTab.tsx does today.
│   │   ├── PingControlsDrawer.css         # NEW
│   │   ├── PingControlsDrawer.test.tsx    # NEW — see § 5
│   │   ├── PingContourDrawer.tsx          # NEW — one AccordionContainer wrapping the single
│   │   │                                  #   shared audioAttributes.adsr editor (Attack/Decay/
│   │   │                                  #   Release via SliderLog, Sustain via SliderLinear).
│   │   │                                  #   Calls AudioEngine.updateVoiceEnvelope (new, see
│   │   │                                  #   below) rather than a full reReserveVoice.
│   │   ├── PingContourDrawer.css          # NEW
│   │   ├── PingContourDrawer.test.tsx     # NEW — see § 5
│   │   ├── SignatureArrayDrawer.tsx       # NEW — one AccordionContainer wrapping the 3 fixed
│   │   │                                  #   layer slots (Baseline/Coaxial/Harmonic), each with
│   │   │                                  #   Type (5 waveforms, no Noise)/Gain/Detune(±50c)/
│   │   │                                  #   Phase/Interval + per-param Lfo accordions, plus
│   │   │                                  #   Coaxial/Harmonic's Active toggle (new
│   │   │                                  #   OscillatorLayer.active field — muting, not deleting)
│   │   ├── SignatureArrayDrawer.css       # NEW
│   │   ├── SignatureArrayDrawer.test.tsx  # NEW — see § 5
│   │   ├── RobotOscillatorsTab.tsx        # REMOVED (+ .css)
│   │   ├── RobotAudioTab.tsx              # REMOVED (+ .css, .test.tsx) — lives in
│   │   │                                  #   panels/screen/console/, see below
│   │   └── RobotMetaTab.tsx               # REMOVED (+ .css, .test.tsx) — lives in
│   │                                      #   panels/screen/console/, see below
│   ├── selection/
│   │   └── (unchanged) — RobotSelectionCard/AudioStatusBadge untouched; robotSelectionConfig.ts's
│   │                     label maps are imported by RobotDisplaySection, not modified
│   └── panels/screen/console/
│       ├── RobotEditorTab.tsx             # RENAMED → RobotOptionsTab.tsx (+ .css). Confirmed
│       │                                  #   during this phase's follow-up interview — it stops
│       │                                  #   being a tabbed "editor" and becomes the Robot
│       │                                  #   Options screen, so the name should say so. The
│       │                                  #   Tabs.Root/3-tab shell is replaced by
│       │                                  #   RobotDisplaySection + the 3 drawers, stacked.
│       ├── RobotOptionsTab.css            # RENAMED from RobotEditorTab.css — tab-strip layout
│       │                                  #   replaced with a stacked drawer layout
│       ├── RobotOptionsTab.test.tsx       # NEW — first test file for this component (mirrors
│       │                                  #   Phase 8's Console.test.tsx precedent); see § 5
│       ├── ConsolePanel.tsx               # MODIFIED — one-line import/usage update
│       │                                  #   (`RobotEditorTab` → `RobotOptionsTab`) to follow the
│       │                                  #   rename; its `selectedRobotId ? <RobotOptionsTab /> :
│       │                                  #   <RobotsTab />` ternary logic itself is unchanged
│       ├── RobotMetaTab.tsx               # REMOVED (+ .css, .test.tsx)
│       ├── RobotAudioTab.tsx              # REMOVED (+ .css, .test.tsx)
│       └── RobotOscillatorsTab.tsx        # REMOVED (+ .css) — no test file existed
├── data/
│   ├── robotOptionsConfig.ts              # NEW — ControlSchema data for all 4 sections,
│   │                                      #   field-for-field from ROBOT_DATA_GRID.md, following
│   │                                      #   audioRigConfig.ts's structural pattern (typed block/
│   │                                      #   param arrays, not one flat schema list)
│   └── robotOptionsConfig.test.ts         # NEW — see § 5
├── types/
│   ├── Robot.ts                           # MODIFIED — `lfoSettings` becomes
│   │                                      #   `Record<RobotLfoTargetId, LfoSettings & { active:
│   │                                      #   boolean }>` (was `Record<..., LfoSettings>`),
│   │                                      #   mirroring audioStore.ts's globalLfo shape — see § 4
│   └── layeredAudio.ts                    # MODIFIED — `OscillatorLayer.adsr` and the `ADSTRaw`
│                                          #   type are removed entirely (nothing else references
│                                          #   partial per-layer ADSR once this phase lands);
│                                          #   `VisualAudioMap.averagedADSR` is also removed (see
│                                          #   the spawnSystem.ts entry below); `OscillatorLayer`
│                                          #   gains a new required `active: boolean` field —
│                                          #   `layers[0]` (Baseline) is always `true`;
│                                          #   `layers[1]`/`layers[2]` (Coaxial/Harmonic) are
│                                          #   toggled by SignatureArrayDrawer's Active control.
│                                          #   `type: WaveformType | 'noise'` narrows to
│                                          #   `WaveformType` only — `'noise'` is dropped (see § 3)
├── engine/
│   ├── AudioEngine.ts                     # MODIFIED — `reserveVoice`/`reReserveVoice` gain a
│   │                                      #   required `adsr: ADSREnvelope` parameter (the same
│   │                                      #   "one shared value applied across every layer" role
│   │                                      #   `phase`/`detune`/`pulseWidth` already play on this
│   │                                      #   function), threaded into `createCompositeVoice`;
│   │                                      #   new `updateVoiceEnvelope(robotId, adsr)` for live
│   │                                      #   Ping Contour edits — rebuilds the existing
│   │                                      #   `{ layers: [...] }` patch from the composite's
│   │                                      #   already-exposed `layers` array with `adsr` stamped
│   │                                      #   onto each entry, then reuses `compositeVoice.ts`'s
│   │                                      #   existing `p.adsr → synth.set({envelope})` path
│   │                                      #   as-is — no new logic inside `compositeVoice.ts`'s
│   │                                      #   live-update path, only its construction path (below).
│   │                                      #   `reReserveVoice` additionally filters
│   │                                      #   `layers.filter(l => l.active)` before calling
│   │                                      #   `reserveVoice` — an inactive Coaxial/Harmonic layer
│   │                                      #   never gets a synth node built for it at all, even
│   │                                      #   though its full config stays in `Robot` state
│   └── audioEngine/
│       └── compositeVoice.ts              # MODIFIED — construction-time only:
│                                          #   `createCompositeVoice(descriptor, adsr)` applies the
│                                          #   passed-in shared ADSR to every layer's initial
│                                          #   `Tone.Synth` envelope, replacing the current
│                                          #   `layer.adsr?.attack ?? 0.01`-style per-layer reads.
│                                          #   The live-update `set()` closure (`p.adsr →
│                                          #   synth.set({envelope: p.adsr})`) is UNCHANGED — it
│                                          #   already applies whatever `adsr` it's handed to a
│                                          #   layer's live synth, which is exactly what the new
│                                          #   shared-envelope model needs. The `layer.type ===
│                                          #   'noise'`/`NoiseSynth` construction branch is deleted
│                                          #   — dead code once `'noise'` is no longer a reachable
│                                          #   `OscillatorLayer.type` value
├── systems/
│   ├── spawnSystem.ts                     # MODIFIED — resolved via this phase's follow-up
│   │                                      #   interview:
│   │                                      #   (1) stops seeding a per-layer `adsr` on each
│   │                                      #   generated `OscillatorLayer`; the gain-weighted
│   │                                      #   `normSum`/`averagedNorm`/`averagedADSR` block is
│   │                                      #   removed outright — nothing reads `averagedADSR`
│   │                                      #   today except its own generator and
│   │                                      #   `spawnSystem.test.ts`;
│   │                                      #   (2) `ATTACK_RANGE`/`DECAY_RANGE`/`RELEASE_RANGE`
│   │                                      #   unify to one flat `{ min: 0, max: 5 }` (was
│   │                                      #   attack/decay `0.01–2`/`0.05–2`, release `0.1–5`) —
│   │                                      #   generation stays narrower than the drawer's 0–10s
│   │                                      #   edit range, same relationship every other seeded
│   │                                      #   field in this phase already has;
│   │                                      #   (3) always generates exactly 3 layers
│   │                                      #   (Baseline/Coaxial/Harmonic), replacing the current
│   │                                      #   1–4 dynamic range and the `'noise'` type option
│   │                                      #   entirely — Baseline's `active` is always `true`;
│   │                                      #   Coaxial's and Harmonic's are each independently
│   │                                      #   seeded true/false;
│   │                                      #   (4) `generateRobotLfoSettings` seeds an `active`
│   │                                      #   boolean per target too (including `'volume'`),
│   │                                      #   mirroring `generateGlobalLfoSettings`'s existing
│   │                                      #   per-planet seeding for the global chain
│   └── spawnSystem.test.ts                # MODIFIED — assertions on per-layer/averaged ADSR
│                                          #   removed; new assertions for the unified 0–5s ADSR
│                                          #   generation range, the fixed 3-layer output with
│                                          #   Baseline always active, and seeded Coaxial/Harmonic/
│                                          #   LFO `active` values
docs/
├── reference/
│   └── ROBOT_DATA_GRID.md                 # MODIFIED — Audio Setting's Options column gains
│                                          #   "Off"; Density's Min/Max corrected from the stale
│                                          #   `1`/`16` to the real `RHYTHMIC_DENSITY_MIN`/`_MAX`
│                                          #   (`0`/`100`, current since roadmap Phase 6 — the grid
│                                          #   was never updated when that phase shipped); Attack/
│                                          #   Decay/Release confirmed at the grid's existing
│                                          #   `0s`–`10s` (no change needed there); Detune confirmed
│                                          #   at the grid's existing `±50` cents (no change needed
│                                          #   there — it was the now-removed per-layer editor's
│                                          #   `±100` that was stale, not the grid)
├── ROBOT_DESIGN.md                        # MODIFIED — per roadmap's existing Docs bullet: Shape
│                                          #   Parameters section reworded now that ADSR is a
│                                          #   single shared envelope, not an average
├── AUDIO_SYSTEM.md                        # MODIFIED — per roadmap's existing Docs bullet: the
│                                          #   `OscillatorLayer.adsr` field is gone from the
│                                          #   Layered/Composite Voices section; document the new
│                                          #   shared-envelope path through `reserveVoice`/
│                                          #   `updateVoiceEnvelope` instead
├── UI_SHELL.md                            # MODIFIED — per roadmap's existing Docs bullet: delete
│                                          #   the "Planned Replacement" section entirely (Phases
│                                          #   3/7/8/9 all shipped after this lands)
└── todo/roadmap.md                     # MODIFIED — § 9's bullets marked resolved
```

**Confirmed NOT touched:** `ConsolePanel.tsx`'s own routing *logic* — its
`selectedRobotId ? <RobotOptionsTab /> : <RobotsTab />` ternary is unchanged in shape, only the
imported component name changes to follow the `RobotEditorTab` → `RobotOptionsTab` rename (see § 2)
— not the "confirmed untouched" file Phase 8 could claim for this same file, since the rename
forces a one-line edit here. `RobotsTab.tsx`/`RobotSelectionCard.tsx`/`AudioStatusBadge.tsx` (Phase 8, untouched),
`src/data/robotSelectionConfig.ts` (imported from, not modified), `src/systems/robotSystems.ts`
(job assignment and docking transitions stay fully automatic — this phase only *reads* `job`/
`docking`, never writes them), `src/engine/lfoEngine.ts` (its `connectLfoTarget`/
`disconnectLfoTarget`/`getLfoSettings`/`setLfoRate`/`setLfoDepth`/`setLfoShape` already accept an
optional `robotId` and already resolve robot-scoped targets via
`AudioEngine.getRobotModulationTarget` — no engine-level LFO-connection change needed, only the
data feeding it), `docs/MELODY_SYSTEM.md`/`docs/POLYPHONY_GUIDE.md` (no melody-generation or
polyphony-budget change).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **No job reassignment, no docking-state override.** Both remain fully automatic
  (`assignJob`/`scoreJobAffinities`, `tickRobotLifecycle` — Phase 7). Robot Display shows them
  read-only. This is a corrected scope boundary from the roadmap's earlier prose — see
  `docs/intent/robot-options.md`.
* **No battery gauge widget.** Battery Data stays plain text `%`, matching Phase 8's
  `RobotSelectionCard` precedent — no new visual-gauge primitive.
* **Audio Setting must expose all 4 `audioMode` values**, including `'none'`/"Off" — dropping it
  would regress existing `RobotAudioTab` behavior (a user can already toggle back off today).
* **Docking's existing behavior is untouched.** Mute-while-docked (`audioMode: 'mute'` set by
  `landOnDocked`) and the battery-driven `Docked ↔ Active` cycle are not read, written, or
  special-cased by anything in this phase beyond the existing read-only display.
* **Robot visuals still map strictly to audio attributes** per `ROBOT_DESIGN.md`'s guardrail — none
  of this phase's controls write anything except already-existing `Robot`/`AudioAttributes` fields
  (or the corrected `lfoSettings` shape); no new visual-only state is introduced.
* **Per-layer ADSR overrides are fully removed**, not hidden — `OscillatorLayer.adsr` leaves the
  type entirely (per roadmap's Removal list). Every layer's synth envelope comes from the robot's
  one `audioAttributes.adsr` going forward.
* **All scheduling/synthesis changes stay off the main-thread timer primitives** — no
  `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's code, matching
  CLAUDE.md's guardrail. Continuous-param edits (gain/detune/phase/pulse width/volume/ADSR) commit
  synchronously through `AudioEngine`, exactly like `RobotOscillatorsTab`'s existing
  `commitContinuous` does today.
* **`robotOptionsConfig.ts` is the only place `ROBOT_DATA_GRID.md`'s Robot Options rows get turned
  into copy.** No component hardcodes a lore/human label string.
* **Reuse over duplication:** Job/Docking/Audio-mode label maps come from
  `src/data/robotSelectionConfig.ts` (Phase 8) — do not create a second copy of
  `JOB_TYPE_LABELS`/`DOCKING_STATE_LABELS`/`AUDIO_MODE_LABELS` in `robotOptionsConfig.ts`.
* **`'noise'` is fully removed as an `OscillatorLayer.type`, not just hidden from the UI.** The
  type narrows to `WaveformType` only, and `compositeVoice.ts`'s dead `NoiseSynth`-construction
  branch goes with it — no lingering "technically still supported" path.
  `audioAttributes.layers` is always exactly 3 entries (Baseline/Coaxial/Harmonic) going forward;
  `spawnSystem.ts` never generates any other length.
  Turning Coaxial or Harmonic's Active toggle off **mutes it, never deletes its configuration** —
  `AudioEngine` excludes an `active: false` layer from the composite voice it builds, but the full
  entry (Type/Gain/Detune/Phase/Interval) stays in `Robot` state untouched.
* **Locked numeric ranges** (confirmed during this phase's follow-up interview, not left to
  Plan/Tasks): Ping Contour's Attack/Decay/Release edit range is `0`–`10s` (unchanged from
  `ROBOT_DATA_GRID.md`); Signature Array's Detune range is `±50` cents (also unchanged from the
  grid — it was the now-removed per-layer editor's `±100` that was the stale number, not the grid).
  Spawn-time ADSR *generation* (as opposed to the edit range) is narrower: a unified `0`–`5s` for
  attack/decay/release, replacing `spawnSystem.ts`'s current mismatched `2`/`2`/`5`s per-field caps.
* **Reset Melody has no confirmation step.** Unlike `RobotAudioTab.tsx`'s current `AlertDialog`-
  wrapped "New Melody" action, Ping Controls' Reset Melody is a plain one-click `Button`, consistent
  with every other `Button` usage in the app.

---

## 4. Code Style & Architecture Conventions

**`src/types/Robot.ts` — `lfoSettings` gains the same `active` flag `globalLfo` already has:**

```typescript
// BEFORE
lfoSettings?: Record<RobotLfoTargetId, LfoSettings>;

// AFTER — mirrors audioStore.ts's `globalLfo: Record<GlobalLfoTargetId, LfoSettings & { active: boolean }>`
lfoSettings?: Record<RobotLfoTargetId, LfoSettings & { active: boolean }>;
```

`spawnSystem.ts`'s `generateRobotLfoSettings` seeds `active` per target the same way
`generateGlobalLfoSettings` already seeds it for the global chain — confirmed during this phase's
follow-up interview: some targets seed already `active: true` (genuinely audible before anything is
touched), not universally `false`-until-touched, for consistency with every other seeded
robot-audio-personality field and with the global chain's existing precedent.

**`src/data/robotOptionsConfig.ts` — same structural pattern as `audioRigConfig.ts`, not one flat
schema list:**

```typescript
import type { ControlSchema, AccordionSchema, RadioButtonSchema, ToggleSchema } from '@/types/controls';
import type { RobotLfoTargetId } from '@/types/lfo';

export type SignatureArrayLayerKey = 'layer0' | 'layer1' | 'layer2';

export interface SignatureArrayParamSchema {
  field: 'type' | 'gain' | 'detune' | 'phase' | 'pulseWidth';
  schema: ControlSchema;
  lfoTarget?: RobotLfoTargetId;       // absent only for `type`, which isn't LFO-modulatable
  lfoAccordion?: AccordionSchema;
}

export interface SignatureArrayLayerBlock {
  key: SignatureArrayLayerKey;
  humanLabel: 'Baseline' | 'Coaxial' | 'Harmonic';
  activeSchema?: ToggleSchema;         // undefined for layer0 (Baseline) — always active
  params: SignatureArrayParamSchema[];
}

export const SIGNATURE_ARRAY_CONFIG: SignatureArrayLayerBlock[] = [ /* ... */ ];
export const PING_CONTROLS_CONFIG = { /* density/motifLength/octaveRange/noteVariance/reset schemas */ };
export const PING_CONTOUR_CONFIG = { /* attack/decay/sustain/release schemas */ };
export const ROBOT_DISPLAY_CONFIG = { /* audioSetting/volume schemas — Name/Job/Battery/Docking
                                          reuse robotSelectionConfig.ts's ROBOT_SELECTION_ROW_SCHEMAS
                                          directly rather than redefining them */ };
```

**Volume's LFO frame — reuse `AudioRigDrawer.tsx`'s exact param-row pattern (§ 1's "Overview"),
not a new composition:**

```typescript
// RobotDisplaySection.tsx, modeled directly on AudioRigDrawer.tsx's eq3.low param row
<SliderLinear schema={ROBOT_DISPLAY_CONFIG.volume} value={robot.masterVolume} onChange={handleVolumeChange} />
<AccordionContainer
  schema={volumeLfoAccordionSchema}
  defaultOpen={robot.lfoSettings?.volume?.active ?? false}
  contentActive={robot.lfoSettings?.volume?.active ?? false}
>
  <Lfo
    schema={{ id: 'robotOptions.volume.lfo', type: 'lfo' }}
    value={robot.lfoSettings?.volume ?? DEFAULT_ROBOT_LFO_VALUE}
    onChange={(v) => handleVolumeLfoChange(v)}
  />
</AccordionContainer>
```

**`AudioEngine.ts`/`compositeVoice.ts` — shared-ADSR plumbing.** Resolved during spec review by
tracing the existing per-layer-override live-update path: `compositeVoice.ts`'s `set()` closure
*already* does `if (p.adsr) synth.set({ envelope: p.adsr })` per layer — genuinely Tone.js-correct
(`Tone.Synth#set` applies a partial envelope live, no recreation, no click). The shared-envelope
model reuses that path as-is rather than inventing a parallel one:

```typescript
// reserveVoice/reReserveVoice gain a required adsr parameter — the same "one shared value
// applied across every layer" role phase/detune/pulseWidth already play on this function
reserveVoice(
  robotId: string,
  descriptor: OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] },
  adsr: ADSREnvelope,          // NEW — applied to every layer's synth envelope at construction
  phase?: number,
  detune?: number,
  pulseWidth?: number,
): boolean

// New — for PingContourDrawer's live Attack/Decay/Sustain/Release edits. No new logic inside
// compositeVoice.ts: rebuilds the existing layers-patch array from the composite's already-exposed
// `layers` (added for getRobotModulationTarget) with the new adsr stamped onto every entry, then
// calls the same `composite.set({ layers })` the continuous-param path already uses.
updateVoiceEnvelope(robotId: string, adsr: ADSREnvelope): void {
  const entry = compositeVoices.get(robotId);
  if (!entry?.composite.layers) return;
  const patched = entry.composite.layers.map(({ layer }) => ({ ...layer, adsr }));
  entry.composite.set({ layers: patched });
}
```

**`compositeVoice.ts` — construction path only** (the live-update `set()` closure is unchanged —
it already applies whatever `adsr` a patch entry carries):

```typescript
// BEFORE — createCompositeVoice(descriptor), no ADSR parameter at all; each layer read its own
// (soon-to-be-removed) layer.adsr override, or a hardcoded fallback if absent
const s = new Tone.Synth({
  oscillator: oscConfig,
  envelope: {
    attack: layer.adsr?.attack ?? 0.01,
    decay: layer.adsr?.decay ?? 0.1,
    sustain: layer.adsr?.sustain ?? 0.8,
    release: layer.adsr?.release ?? 0.5,
  },
});

// AFTER — createCompositeVoice(descriptor, adsr) applies the one shared envelope to every layer
const s = new Tone.Synth({
  oscillator: oscConfig,
  envelope: { attack: adsr.attack, decay: adsr.decay, sustain: adsr.sustain, release: adsr.release },
});
```

**Sustain's display-vs-storage split** — `ADSREnvelope.sustain` is stored `0..1` (per `Robot.ts`'s
own comment), but `ROBOT_DATA_GRID.md`'s Sustain row is `0%`–`100%`. Unlike every other `SliderLinear`
usage in this codebase (where the schema's numeric range *is* the stored value), Sustain needs an
explicit `×100`/`÷100` conversion at the component boundary — schema `{ min: 0, max: 100, unit: '%'
}`, `onChange={(pct) => updateRobot(localeId, robot.id, { audioAttributes: { ...robot.audioAttributes, adsr: { ...robot.audioAttributes.adsr, sustain: pct / 100 } } })}`.
Call this out with an inline comment at the call site — it's the one field in this phase that isn't
a 1:1 pass-through, the same way `hslToString`'s `alpha` parameter needed a documented exception in
Phase 8's spec.

**Fixed-slot Signature Array layer access** — with layers now always exactly 3
(`layers[0]`/`[1]`/`[2]`, Baseline/Coaxial/Harmonic), `SignatureArrayDrawer.tsx` indexes directly
rather than mapping over a variable-length array the way `RobotOscillatorsTab.tsx`'s `LayerRow`
loop does today. Confirmed during this phase's follow-up interview: the array stays a constant
length 3 always — toggling Coaxial/Harmonic off sets `active: false` and mutes it (excluded from
the composite voice `AudioEngine` builds), it never removes the array element or discards its
Type/Gain/Detune/etc. — so a layer's full config survives being switched off and picks up exactly
where it left off when switched back on:

```typescript
const layers = robot.audioAttributes.layers; // always length 3
const baseline = layers[0];  // active: true, always
const coaxial = layers[1];   // active: boolean, user-toggled
const harmonic = layers[2];  // active: boolean, user-toggled

// Toggling Coaxial off — settings untouched, just muted:
const handleCoaxialActiveChange = (active: boolean) => {
  const updated = layers.map((l, i) => (i === 1 ? { ...l, active } : l));
  commitStructural(robot, localeId, updated, updateRobot); // AudioEngine.reReserveVoice,
  // which filters out any layer with active: false before building the composite voice
};
```

* **Naming Conventions:** `src/components/robot/` stays flat, PascalCase files, matching
  `RobotBody.tsx`/`Robot.tsx`'s existing pattern. `robotOptionsConfig.ts` follows
  `audioRigConfig.ts`'s naming (`*Config.ts`, `UPPER_SNAKE` exported constants,
  `SCREAMING_SNAKE_CONFIG` for the top-level arrays).
* **Formatting:** Match each touched file's existing comment-banner style; no new convention.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, real Zustand stores (not deep-mocked) — matching
  `RobotAudioTab.test.tsx`'s existing pattern: seed `useLocaleStore`/`useUIStore` directly, spy on
  `updateRobot`/`AudioEngine` methods, assert on rendered DOM by accessible name/role.
* **Test File Location:** Colocate (see § 2 for exact files).
* **`robotOptionsConfig.test.ts` (new):** every `ControlSchema` entry's `type` is one of
  `CONTROL_SCHEMA_TYPES`; `SIGNATURE_ARRAY_CONFIG` has exactly 3 blocks with the right
  `humanLabel`s and only `layer1`/`layer2` carry an `activeSchema`; every LFO-flagged param has a
  matching `lfoTarget` that's a real `RobotLfoTargetId`; mirrors `audioRigConfig`'s own closed-set
  testing style referenced by `AudioRigDrawer.tsx`'s top comment.
* **`RobotDisplaySection.test.tsx` (new):**
  1. Renders Name/Job/Battery(`%`)/Docking as plain text (no input/button role attached to those
     four rows) — regression guard for "these are not editable."
  2. Renders no job-reassignment or docking-override control anywhere.
  3. Audio Setting radio includes all 4 options (Off/Mute/Solo/Highlight); selecting one calls
     `updateRobot` with the matching `audioMode`.
  4. Volume slider reflects `robot.masterVolume` and calls `updateRobot` on change.
  5. Volume's Lfo accordion reflects `robot.lfoSettings.volume`'s `active` state and calls the
     wiring that updates it (store write + `lfoEngine.connectLfoTarget`/`disconnectLfoTarget`
     analog to how `AudioRigDrawer` wires `setGlobalLfo`).
* **`PingControlsDrawer.test.tsx` (new):** density/motif-length/octave-range/note-variance changes
  call `updateRobot` and `regenerateMelody`, mirroring `RobotAudioTab.test.tsx`'s existing density
  test almost verbatim (same store, same spies) — this is largely a like-for-like port of that
  file's assertions onto the new schema-driven controls. Reset Melody is a plain one-click `Button`
  — confirmed during this phase's follow-up interview to drop the old `AlertDialog` confirm step
  for consistency with every other `Button` in the app — so its test asserts `regenerateMelody`
  fires directly on click, with no confirm/cancel step to simulate.
* **`PingContourDrawer.test.tsx` (new):**
  1. Attack/Decay/Release/Sustain each read from and write to `audioAttributes.adsr` (not a
     per-layer field).
  2. Sustain's `%`-display round-trips correctly against the underlying `0..1` stored value (see §
     4's conversion note) — e.g. a stored `0.8` displays `80`, and setting the control to `50`
     writes `0.5`.
  3. An edit calls `AudioEngine.updateVoiceEnvelope`, not `reReserveVoice` (no audio gap).
* **`SignatureArrayDrawer.test.tsx` (new):**
  1. Exactly 3 layer sections render, labeled Baseline/Coaxial/Harmonic.
  2. Baseline has no Active toggle; Coaxial and Harmonic each do.
  3. Type's radio options are exactly the 5 waveform shapes — no "Noise" option anywhere.
  4. Interval/pulse-width control only renders when a layer's Type is Burst(pulse); hidden for
     Binary(square) too — Tone.js's `OmniOscillator.width` has no effect there.
  5. A Type change calls `AudioEngine.reReserveVoice` (structural); a Gain/Detune/Phase/Interval
     change calls `AudioEngine.updateVoiceLayerParams` (continuous) — same split
     `RobotOscillatorsTab.test.tsx`-equivalent coverage would have asserted.
  6. Toggling Coaxial/Harmonic's Active off still renders its Type/Gain/Detune/etc. controls with
     their existing values intact (not cleared/hidden) — regression guard for "mute, don't delete."
  7. Each LFO-flagged param's accordion wires to `robot.lfoSettings['layerN.field']`.
* **`AudioEngine.test.ts` (modified, new cases):** `reReserveVoice` excludes any layer with
  `active: false` from the array passed to `reserveVoice`/`createCompositeVoice` — an inactive
  layer never gets a synth node — while `robot.audioAttributes.layers` in the store keeps all 3
  entries regardless; `updateVoiceEnvelope` patches every *active* layer's live synth envelope via
  the existing `composite.set({ layers })` path and is a no-op (with a `devWarn`, matching
  `updateVoiceLayerParams`'s existing pattern) when no composite is reserved for the robot.
* **`RobotOptionsTab.test.tsx` (new, first test file for this component, renamed from
  `RobotEditorTab.test.tsx`):** renders `RobotDisplaySection` plus all 3 drawers when a robot is
  selected; renders the existing not-selected fallback otherwise (regression guard for the
  defensive branch already in the file).
* **`spawnSystem.test.ts` (modified):** remove the per-layer-ADSR-seeding and
  `normSum`/`averagedNorm`/`averagedADSR` assertions entirely (the field is gone, per § 7's
  "Resolved during spec review"); add/update assertions that shape params (`scale`/`roundness`/
  `detail`) derive directly from `audioAttributes.adsr`, normalized by the same `ADSR_MAX` bounds
  the removed averaging block used.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including modified `spawnSystem.test.ts`.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual check (`npm run dev`): select a robot, confirm Robot Display shows correct read-only
     Name/Job/Battery/Docking and both Audio Setting and Volume audibly affect the robot; open each
     of the 3 drawers, confirm Ping Controls regenerates the melody, Ping Contour's envelope edits
     are audible without a dropout, and Signature Array's per-layer controls (including LFO frames)
     behave like `AudioRigDrawer`'s already-shipped equivalents; confirm a robot's visual shape
     still updates consistent with `ROBOT_DESIGN.md` after an ADSR edit.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** `feature/robot-options` (suggested, matching `feature/robot-selection`'s
  precedent) — not yet created as of this spec.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences, roughly: (1) `Robot.ts`/`layeredAudio.ts` type changes (`lfoSettings` active flag,
  `OscillatorLayer.adsr`/`ADSTRaw`/`'noise'` removal, new `OscillatorLayer.active` field) + touched
  test fixtures, (2) `AudioEngine.ts`/`compositeVoice.ts` shared-ADSR plumbing + active-layer
  filtering + `'noise'`-branch removal + tests, (3) `spawnSystem.ts` fixed-3-layer generation +
  unified 0–5s ADSR range + `generateRobotLfoSettings` active-seeding + `spawnSystem.test.ts`, (4)
  `robotOptionsConfig.ts` + test, (5) `RobotDisplaySection` + test, (6) `PingControlsDrawer` + test,
  (7) `PingContourDrawer` + test, (8) `SignatureArrayDrawer` + test, (9)
  `RobotEditorTab.tsx`/`.css` → `RobotOptionsTab.tsx`/`.css` rename+rewire + test +
  `ConsolePanel.tsx`'s one-line import update, (10) removal commit for
  `RobotMetaTab`/`RobotAudioTab`/`RobotOscillatorsTab` and their tests, (11) doc updates
  (`ROBOT_DATA_GRID.md`, `ROBOT_DESIGN.md`, `AUDIO_SYSTEM.md`, `UI_SHELL.md`, `roadmap.md`) last.

---

## 7. Open Questions & Risks

All 7 open questions raised in the initial draft of this spec were resolved in a `/interview-me`
style follow-up pass with Crawford before implementation — none are carried forward as open. This
section is kept as a decision record so Plan/Tasks (and anyone reading this spec later) has the
"why," not just the "what," for the least obvious calls:

1. **Ping Contour's Attack/Decay/Release edit range is `0`–`10s`** (the design-grid number, not
   `spawnSystem.ts`'s narrower seeded-generation ranges or the now-removed per-layer editor's
   ranges — none of those three was "the" authority for a brand-new shared-envelope control).
   Spawn-time *generation*, kept deliberately narrower than the edit range, unifies to `0`–`5s`
   across attack/decay/release.
2. **Signature Array's Detune range is `±50` cents**, per `ROBOT_DATA_GRID.md` — the current (being
   removed) per-layer editor's `±100` was the stale number, not the grid.
3. **`'noise'` is dropped as a selectable oscillator layer type entirely** — not just hidden from
   the new UI. Nothing today ever actually generates a `'noise'` layer, and the whole visual/audio
   design system (shape, hue, greebles) is built around the 5 real waveforms specifically per
   `ROBOT_DESIGN.md`; `'noise'` never mapped to anything there.
4. **Fixed-slot Signature Array, not dynamic add/delete.** `audioAttributes.layers` becomes a
   constant length-3 array (Baseline/Coaxial/Harmonic) forever — `spawnSystem.ts` always generates
   exactly 3 going forward, so there's no old-shape data to migrate. Turning Coaxial or Harmonic's
   Active toggle off **mutes it without discarding its configuration**: `AudioEngine` excludes an
   `active: false` layer from the composite voice it builds (no synth node created for it), while
   the full entry stays in `Robot` state, ready to resume the instant it's switched back on.
5. **Per-robot LFO targets (including Volume) are seeded `active` at spawn**, mirroring how the
   global Audio Rig chain already seeds some effects' LFOs already-on per planet — freshly-spawned
   robots can sound alive/modulated before anything is touched, not uniformly static until edited.
6. **Reset Melody drops the confirmation dialog** — a plain one-click `Button`, consistent with
   every other `Button` in the app, rather than `RobotAudioTab.tsx`'s current `AlertDialog`-wrapped
   step. *(Forward note, out of scope for this phase: Crawford wants a future Transport Bar undo
   action — a general "undo the last change" affordance would cover Reset Melody's now-unconfirmed
   regenerate along with other actions. Not part of Robot Options; flagging for whichever future
   phase takes on Transport Bar / undo.)*
7. **`RobotEditorTab.tsx` is renamed to `RobotOptionsTab.tsx`** (+ `.css`), with `ConsolePanel.tsx`'s
   import updated to match — Crawford's call: "I don't need legacy stuff like that laying around,"
   overriding this spec's initial Strict-Scope-minded lean toward keeping the old name.
