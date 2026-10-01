# Robot Data Grid

| English Label | Lore Label | Component | Min Value | Max Value | Has LFO | Notes |
|---|---|---|---|---|---|---|
| Robot Name | ROBOT IDENTIFIER | Dual Label Component | N/A | N/A | No | Display only |
| Job Data | ASSIGNED PROTOCOL | Dual Label Component | N/A | N/A | No | Display only |
| Battery Data | POWER CELL STATUS | Dual Label Component | N/A | N/A | No | Display only |
| Docked Status | DOCKING STATE | Dual Label Component | N/A | N/A | No | States: DOCKED, DOCKING, DEPARTING, ACTIVE |
| Status | ACOUSTIC EMISSION STATE *(draft, unconfirmed)* | Dual Label Component | N/A | N/A | No | Display only. True audibility (`isRobotAudible`) — Robot Options' own Status field, Roadmap 15.3. Values: Emitting, Disabled (see Draft table below) |
| Company | UNIT AFFILIATION | Select Component | N/A | N/A | No | Options: Freelance, plus one per Company in the robot's locale. Reassigns `robot.companyId` via `assignRobotToCompany` (`localeStore.ts`); undefined `companyId` displays as Freelance |
| Audio Setting | PROBE DIAGNOSTICS | Radio Button Component | N/A | N/A | No | Options: Off, Mute, Solo, Highlight |
| Volume | TRANSDUCER PRESSURE INDEX | Slider - linear Component | 0% | 100% | No | Linear scaling for held level ratio. Display-only 0–100%, 1% steps — stored as `robot.masterVolume`, a 0–1 fraction (`VOLUME_SCHEMA`, `robotOptionsConfig.ts`), same display-vs-storage split as Sustain below. The Volume LFO target was removed (docs/specs/LFO_LOAD_FIX.md) — Mode and Volume are the only two Output controls now |
| **DRAWER** | PING CONTROLS | Accordion Container | N/A | N/A | No | Parent container for ping controls |
| Density | PING DENSITY | Slider - linear Component | 0 | 100 | No | Percentage fill rate of the measure/motif (Roadmap Phase 6). Was a Stepper originally — converted early (clicking through 0-100 one increment at a time was too slow), this row was simply never updated until docs/specs/STEPPER_TO_SLIDER.md |
| Motif Length | PING LENGTH | Slider - linear Component | 0 | 8 | No | Repeating rhythmic motif length in 16th notes. `0` is the off state (no separate toggle) — was a Stepper+Toggle, min `1`, before docs/specs/STEPPER_TO_SLIDER.md |
| Note Variance | PING FREQUENCY VARIANCE | Slider - linear Component | 0 | 8 | No | `0`: unweighted random selection. `1`-`8`: slices pitch array length. `0` is the off state (no separate toggle) — was a Stepper+Toggle, min `1`, before docs/specs/STEPPER_TO_SLIDER.md |
| Octave Range Min | PING FREQUENCY RANGES (MIN) | Slider - linear Component | 1 | 7 | No | Minimum octave bound. Was a Stepper before docs/specs/STEPPER_TO_SLIDER.md |
| Octave Range Max | PING FREQUENCY RANGES (MAX) | Slider - linear Component | 1 | 7 | No | Maximum octave bound. Was a Stepper before docs/specs/STEPPER_TO_SLIDER.md |
| Reset Melody | CALIBRATE PING | Button Component | N/A | N/A | No | Resets melody pattern generation |
| **DRAWER** | PING CONTOUR | Accordion Container | N/A | N/A | No | Parent container for ADSR envelope |
| Attack | COMPRESSION RATE | Slider - log Component | 0s | 10s | No | Logarithmic scaling for fast transient control |
| Decay | STABILIZATION DELAY | Slider - log Component | 0s | 10s | No | Logarithmic scaling for initial drop |
| Sustain | PROPAGATION AMPLITUDE | Slider - linear Component | 0% | 100% | No | Linear scaling for held level ratio. Display-only 0–100% — stored as `audioAttributes.adsr.sustain`, a 0–1 fraction (`SUSTAIN_SCHEMA`, `robotOptionsConfig.ts`), same display-vs-storage split as Volume above |
| Release | RAREFACTION RATE | Slider - log Component | 0s | 10s | No | Logarithmic scaling for tail fade-out |
| **DRAWER** | SIGNATURE ARRAY | Accordion Container | N/A | N/A | No | Parent container for oscillator layers |
| Layer 1: Type | BASELINE GEOMETRY | Radio Button Component | N/A | N/A | No | Options: SWEEP (sine), GRADIENT (triangle), KINETIC (saw), BINARY (square), BURST (pulse) |
| Layer 1: Gain | BASELINE SATURATION | Slider - linear Component | 0 | 2 | Yes | Linear scaling for held level ratio |
| Layer 1: Detune | BASELINE DRIFT | Slider - centered zero Component | -50 cents | +50 cents | Yes | Linear scaling for held level ratio |
| Layer 1: Phase | BASELINE ALIGNMENT | Slider - linear Component | 0 | 360 | Yes | Phase offset in degrees |
| Layer 1: Interval | BASELINE PULSE WIDTH | Slider - linear Component | 0 | 1 | No | Only displayed when Type is BURST (pulse) — Tone.js's `OmniOscillator.width` getter returns `undefined` for every other type, including BINARY (square), so this was dropped from the BINARY case (`SignatureArrayDrawer.tsx`'s `showPulseWidth`). The pulse-width LFO target was removed (docs/specs/LFO_LOAD_FIX.md) — the slider itself stays, un-targeted; each layer's LFO group offers Gain/Detune/Phase only |
| Layer 2: Type | COAXIAL GEOMETRY | Radio Button Component | N/A | N/A | No | Options: SWEEP, GRADIENT, KINETIC, BINARY, BURST |
| Layer 2: Gain | COAXIAL SATURATION | Slider - linear Component | 0 | 2 | Yes | Linear scaling for held level ratio. 0 also mutes the layer — there is no separate Active toggle; `AudioEngine.ts`'s `filterAudibleLayers` excludes a `gain: 0` layer from the composite voice, matching the removed toggle's old "mute, don't delete" behavior |
| Layer 2: Detune | COAXIAL DRIFT | Slider - centered zero Component | -50 cents | +50 cents | Yes | Linear scaling for held level ratio |
| Layer 2: Phase | COAXIAL ALIGNMENT | Slider - linear Component | 0 | 360 | Yes | Phase offset in degrees |
| Layer 2: Interval | COAXIAL PULSE WIDTH | Slider - linear Component | 0 | 1 | No | Only displayed when Type is BURST (pulse) — see Layer 1: Interval's note |
| Layer 3: Type | HARMONIC GEOMETRY | Radio Button Component | N/A | N/A | No | Options: SWEEP, GRADIENT, KINETIC, BINARY, BURST |
| Layer 3: Gain | HARMONIC SATURATION | Slider - linear Component | 0 | 2 | Yes | Linear scaling for held level ratio. 0 also mutes the layer — see Layer 2: Gain's own note |
| Layer 3: Detune | HARMONIC DRIFT | Slider - centered zero Component | -50 cents | +50 cents | Yes | Linear scaling for held level ratio |
| Layer 3: Phase | HARMONIC ALIGNMENT | Slider - linear Component | 0 | 360 | Yes | Phase offset in degrees |
| Layer 3: Interval | HARMONIC PULSE WIDTH | Slider - linear Component | 0 | 1 | No | Only displayed when Type is BURST (pulse) — see Layer 1: Interval's note |
| **LFO MODULE** | OSCILLATION | LFO Component | N/A | N/A | No | Attached LFO module for parameters flagged with HAS LFO. Rendered inside a "Modulation" accordion — now wired with this lore label at every call site (`AudioRigDrawer.tsx`/`AudioSettingSection.tsx`/`LfoTargetGroup.tsx`) |
| LFO Shape | OSCILLATION SHAPE | Radio Button Component | N/A | N/A | No | Options: TRIANGLE, SINE, SQUARE, SAWTOOTH |
| LFO Rate | OSCILLATION RATE | Slider - linear Component | 0 Hz | 20 Hz | No | LFO modulation speed. 0 Hz is a real, meaningful value — the LFO's "off" state, replacing the removed OSCILLATION STATE toggle below |
| LFO Depth | OSCILLATION DEPTH | Slider - linear Component | 0% | 100% | No | LFO modulation intensity |

There is no separate OSCILLATION STATE / "LFO Active" toggle — it was removed. Rate=0 is now the "off" state, and a live LFO's `.connect()`/`.disconnect()` is driven off `rate > 0` instead of a boolean (see `src/stores/audioStore.ts`'s `setGlobalLfo` / `src/systems/robotOptionsActions.ts`'s `applyLayerLfo`).

## Draft — pending review

Added by Roadmap Phase 8 (Robot Selection). The table above only defines category-level lore/human
pairs (e.g. "Job Data"/"ASSIGNED PROTOCOL") — it has no per-*value* labels for the individual job
types, docking states, or audio-mode values a Robot Selection card actually displays. The rows
below are best-guess drafts (`src/data/robotSelectionConfig.ts`), not yet confirmed — Crawford,
please review/edit both here and in that file together.

| English Label | Lore Label | Field | Notes |
|---|---|---|---|
| Vent Extraction | VOLATILE VENT EXTRACTION | `JobType.VentExtraction` | Job Data value |
| Acoustic Survey | HIGH-ALTITUDE ACOUSTIC SURVEY | `JobType.AcousticSurvey` | Job Data value |
| Structural Inspection | STRUCTURAL INTEGRITY INSPECTION | `JobType.StructuralInspection` | Job Data value |
| Fluid Monitoring | SUBSTATION FLUID MONITORING | `JobType.FluidMonitoring` | Job Data value |
| Unassigned | NO PROTOCOL ASSIGNED | (no `job`) | Job Data value shown while Docked/Docking/Departing |
| Docked | DOCKED | `DockingState.Docked` | Docked Status value |
| Docking | DOCKING | `DockingState.Docking` | Docked Status value |
| Departing | DEPARTING | `DockingState.Departing` | Docked Status value |
| Active | ACTIVE | `DockingState.Active` | Docked Status value |
| Off | OFFLINE | `audioMode: 'none'` | Audio Setting value — purple status dot |
| Mute | SILENCED | `audioMode: 'mute'` | Audio Setting value — red status dot |
| Solo | ISOLATED | `audioMode: 'solo'` | Audio Setting value — green status dot |
| Highlight | PRIORITIZED | `audioMode: 'highlight'` | Audio Setting value — amber status dot |
| Emitting | ACOUSTIC EMISSION ACTIVE | `AUDIBILITY_LABELS.emitting` | Card Status value (Roadmap 15.2) — true audibility (not muted, and not excluded by another robot's Solo), not just this robot's own audioMode |
| Disabled | ACOUSTIC EMISSION SUPPRESSED | `AUDIBILITY_LABELS.disabled` | Card Status value (Roadmap 15.2) |
