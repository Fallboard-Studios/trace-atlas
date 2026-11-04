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
| Pan | BEARING *(placeholder lore word)* | Slider - centered-zero Component | -100 | 100 | No | Display-only signed −100…100, 1 step, no L/R letters — stored as `robot.pan`, a −1…1 fraction (`PAN_SCHEMA`, `robotOptionsConfig.ts`; `PAN_DISPLAY_SCALE`), same display-vs-storage split as Volume. Read-only (shows the live position-follow value) while Auto is on; interactive while it is off. Manual range is the full ±1; Auto's own field stays ±0.5. No seed: a spawned robot is always Auto at `0`. Saved in sessions and share links when Auto is off (unlike Volume) |
| Auto | TRACKING *(placeholder lore word)* | Toggle Component | N/A | N/A | No | `robot.panAuto` (`PAN_AUTO_SCHEMA`). On (default): the panner follows the robot across the field as before. Off: it holds the Pan value and the robot keeps moving; the live position becomes the Pan value at that moment |
| Reverb | REMOTENESS *(placeholder lore word)* | Slider - linear Component | 0% | 100% | No | How much of this robot's post-Volume signal enters the shared Reverb room (Robot Sends, roadmap 50.2). Display-only 0–100%, 1% steps — stored as `robot.reverbSend`, a 0–1 fraction (its row of `ROBOT_SEND_SCHEMAS`, `robotOptionsConfig.ts`, built from the send table `ROBOT_SENDS`; `SEND_DISPLAY_SCALE`), same display-vs-storage split as Volume. Seeded at spawn in `0.1–0.6` on every robot (`generateRobotSends`, from the band table's `reverbSend` row, `src/data/bands/classic.ts`; the old global Reverb band, widened from `0.1–0.4` by the Classic Band Retune, 2026-10-21, for more contrast between a dry robot and a wet one); `0` is a robot with no reverb at all. A robot swell attribute (live only while the send is above `0`), so the slider can crawl on its own and a hand edit cancels it. Saved in sessions and share links when it differs from its seed (unlike Volume) |
| Delay | RETRACE DEPTH *(placeholder lore word)* | Slider - linear Component | 0% | 100% | No | As Reverb, into the shared Delay room: `robot.delaySend` (its row of `ROBOT_SEND_SCHEMAS`). Seeded in `0–0.3` with a roll under 1 − its `lit` share (0.75, so 0.25) putting exactly `0` on a share of the fleet (a quarter of the fleet: the roll draws even since Even Seeded Draws T9a, 2026-11-02; it was 17–18 % on the plain draw). A robot swell attribute and a persisted field exactly like Reverb |
| Grit | CARRIER BLEED SEND *(placeholder lore word)* | Slider - linear Component | 0% | 100% | No | How much of this robot's post-Volume signal enters the shared Colour room, where the Distortion, Chebyshev and BitCrusher are branches (Robot Effect Sends, roadmap 50.7). Stored as `robot.gritSend`, a 0–1 fraction (its row of `ROBOT_SEND_SCHEMAS`), the same display-vs-storage split as Reverb. Seeded in `0.4–0.8` on about one robot in five (the band table's `gritSend` row, `lit` 0.21) and exactly `0` on the rest; a fresh robot carries at most one of Grit, Shimmer and Double. Heard only through a colour effect whose Mix is above 0. A robot swell attribute and a persisted field (`gr`) exactly like Reverb |
| Shimmer | BAND SLIP SEND *(placeholder lore word)* | Slider - linear Component | 0% | 100% | No | As Grit, into the shared Shimmer room (the Frequency Shifter): `robot.shimmerSend` (its row of `ROBOT_SEND_SCHEMAS`). Seeded in `0.2–0.5` at `lit` 0.16. A robot swell attribute and a persisted field (`sm`) |
| Double | TWIN CURRENT SEND *(placeholder lore word)* | Slider - linear Component | 0% | 100% | No | As Grit, into the shared Double room (the Chorus): `robot.doubleSend` (its row of `ROBOT_SEND_SCHEMAS`). Seeded in `0.3–0.6` at `lit` 0.19. A robot swell attribute and a persisted field (`db`) |
| Dynamics | PRESSURE SWING | Slider - linear Component | 0 | 100 | No | How much this robot's note velocities swing from one to the next (Robot Performance, roadmap 50.5). Stored as `robot.dynamics`, an integer 0–100 (`DYNAMICS_SCHEMA`, `robotOptionsConfig.ts`), no conversion. Scales the existing velocity variance's rate and width: 50 is the pre-50.5 sound exactly, 0 is flat, 100 doubles both. Seeded at spawn in `25–75` (the `robot.dynamics` band, `src/data/bands/classic.ts`; no theme or aspect moves it), rounded. Read on every note at trigger time; no melody regeneration. Not a swell attribute. Saved in sessions and share links (`dy`) when it differs from its seed |
| **DRAWER** | PING CONTROLS | Accordion Container | N/A | N/A | No | Parent container for ping controls |
| Density | PING DENSITY | Slider - linear Component | 0 | 100 | No | Percentage fill rate of the measure/motif (Roadmap Phase 6). Was a Stepper originally — converted early (clicking through 0-100 one increment at a time was too slow), this row was simply never updated until docs/specs/STEPPER_TO_SLIDER.md |
| Motif Length | PING LENGTH | Slider - linear Component | 0 | 8 | No | Repeating rhythmic motif length in 16th notes. `0` is the off state (no separate toggle) — was a Stepper+Toggle, min `1`, before docs/specs/STEPPER_TO_SLIDER.md |
| Note Variance | PING FREQUENCY VARIANCE | Slider - linear Component | 0 | 8 | No | `0`: unweighted random selection. `1`-`8`: slices pitch array length. `0` is the off state (no separate toggle) — was a Stepper+Toggle, min `1`, before docs/specs/STEPPER_TO_SLIDER.md |
| Octave Range Min | PING FREQUENCY RANGES (MIN) | Slider - linear Component | 1 | 7 | No | Minimum octave bound. Was a Stepper before docs/specs/STEPPER_TO_SLIDER.md |
| Octave Range Max | PING FREQUENCY RANGES (MAX) | Slider - linear Component | 1 | 7 | No | Maximum octave bound. Was a Stepper before docs/specs/STEPPER_TO_SLIDER.md |
| **PANEL** | ARTICULATION MATRIX | Directional Panel | N/A | N/A | No | The Composition section's labelled Articulation panel (`ARTICULATION_PANEL_SCHEMA`), after the Octave row; holds Rests and Accents (Robot Performance, roadmap 50.5) |
| Rests | PAYLOAD GAPS | Slider - linear Component | 0 | 100 | No | How often a note stops early and leaves a gap, and how deep the cut (a rest removes a quarter to three quarters of the note; never a skip). Stored as `robot.rests`, an integer 0–100 (`RESTS_SCHEMA`). Baked into the melody as `MelodyEvent.rest` by the post-pass `applyPerformanceMarks` from the seed's own performance stream, so the notes never move; an edit regenerates (`applyRests`). Seeded in `10–60` under Classic (the `robot.rests` band, `src/data/bands/classic.ts`; every other theme moves it, see "Loading ranges by theme and aspect" below). Saved (`rt`) when it differs from its seed |
| Accents | PAYLOAD STRESS | Slider - linear Component | 0 | 100 | No | How often a note carries one of the five classical marks (accent, marcato, staccato, staccatissimo, tenuto) and how many kinds are unlocked (tiers at 34 and 67, `unlockedMarks`). Stored as `robot.accents`, an integer 0–100 (`ACCENTS_SCHEMA`); baked into the melody as `MelodyEvent.mark` by the same post-pass. Seeded in `20–80` (the `robot.accents` band, `src/data/bands/classic.ts`; no theme or aspect moves it). Saved (`ax`) when it differs from its seed |
| Reset Melody | CALIBRATE PING | Button Component | N/A | N/A | No | Resets melody pattern generation |
| **DRAWER** | PING CONTOUR | Accordion Container | N/A | N/A | No | Parent container for ADSR envelope |
| Attack | COMPRESSION RATE | Slider - log Component | 0.015s | 2s | No | Logarithmic scaling for fast transient control. The max is `ENVELOPE_TIME_MAX_SECONDS` (2 s, was 10 s): at several seconds a robot's back-to-back 16ths never let the gate close and it becomes a drone. The min is `ENVELOPE_ATTACK_MIN_SECONDS` (15 ms, was 0): a shorter attack clicks |
| Decay | STABILIZATION DELAY | Slider - log Component | 0s | 2s | No | Logarithmic scaling for initial drop. Same 2 s max as Attack |
| Sustain | PROPAGATION AMPLITUDE | Slider - linear Component | 0% | 100% | No | Linear scaling for held level ratio. Display-only 0–100% — stored as `audioAttributes.adsr.sustain`, a 0–1 fraction (`SUSTAIN_SCHEMA`, `robotOptionsConfig.ts`), same display-vs-storage split as Volume above |
| Release | RAREFACTION RATE | Slider - log Component | 0.02s | 2s | No | Logarithmic scaling for tail fade-out. Same 2 s max as Attack; the min is `ENVELOPE_RELEASE_MIN_SECONDS` (20 ms, was 0): a shorter release clicks |
| Portamento | PING GLIDE *(placeholder lore word)* | Slider - log Component | 0s | 2s | No | Seconds each layer glides into the next note; stored as `audioAttributes.portamento` (`PORTAMENTO_SCHEMA`, `robotOptionsConfig.ts`), absent or `0` = no glide. Applied live through `AudioEngine.updateVoicePortamento`. Past the note length it is still audible, as a smear |
| Attack Shape | ONSET PROFILE *(placeholder lore word)* | Radio Button Component | N/A | N/A | No | The curve the attack rises along: Linear, Exponential, Sine, Cosine, Bounce, Ripple, Step (lore: Even, Surge, Ebb, Tide, Rebound, Tremor, Ratchet). Stored as `adsr.attackCurve` (`ATTACK_CURVE_SCHEMA`); absent = Linear. Only audible when the attack finishes inside the note |
| Release Shape | FADE PROFILE *(placeholder lore word)* | Radio Button Component | N/A | N/A | No | The same seven curves for the release; stored as `adsr.releaseCurve` (`RELEASE_CURVE_SCHEMA`); absent = Linear |
| **DRAWER** | SIGNATURE ARRAY | Accordion Container | N/A | N/A | No | Parent container for oscillator layers |
| Layer 1: Type | BASELINE GEOMETRY | Radio Button Component | N/A | N/A | No | Options: SWEEP (sine), GRADIENT (triangle), KINETIC (saw), BINARY (square), BURST (pulse) |
| Layer 1: Gain | BASELINE SATURATION | Slider - linear Component | 0 | 2 | Yes | Linear scaling for held level ratio. Carries an inline Lane + Depth `LfoLink` (see LFO LINK rows below) — no per-field shape/rate; those live on the linked lane itself (Fleet Params → LFO Bank) |
| Layer 1: Detune | BASELINE DRIFT | Slider - centered zero Component | -50 cents | +50 cents | Yes | Linear scaling for held level ratio. Carries an inline Lane + Depth `LfoLink` — see Layer 1: Gain's own note |
| Layer 1: Phase | BASELINE ALIGNMENT | Slider - linear Component | 0 | 360 | No | Phase offset in degrees. No live Signal to modulate — cut from `RobotLfoTargetId` entirely (docs/tasks/LFO_BANK.md Task 1); stays a plain slider |
| Layer 1: Interval | BASELINE PULSE WIDTH | Slider - linear Component | 0 | 1 | No | Only displayed when Type is BURST (pulse) — Tone.js's `OmniOscillator.width` getter returns `undefined` for every other type, including BINARY (square), so this was dropped from the BINARY case (`SignatureArrayDrawer.tsx`'s `showPulseWidth`). The pulse-width LFO target was removed (docs/specs/LFO_LOAD_FIX.md) — the slider itself stays, un-targeted; each layer now offers an `LfoLink` on Gain/Detune only (Phase was cut too, docs/tasks/LFO_BANK.md Task 1) |
| Layer 2: Type | COAXIAL GEOMETRY | Radio Button Component | N/A | N/A | No | Options: SWEEP, GRADIENT, KINETIC, BINARY, BURST |
| Layer 2: Gain | COAXIAL SATURATION | Slider - linear Component | 0 | 2 | Yes | Linear scaling for held level ratio. 0 also mutes the layer — there is no separate Active toggle; `AudioEngine.ts`'s `filterAudibleLayers` excludes a `gain: 0` layer from the composite voice, matching the removed toggle's old "mute, don't delete" behavior. Carries an inline Lane + Depth `LfoLink` — see Layer 1: Gain's own note |
| Layer 2: Detune | COAXIAL DRIFT | Slider - centered zero Component | -50 cents | +50 cents | Yes | Linear scaling for held level ratio. Carries an inline Lane + Depth `LfoLink` — see Layer 1: Gain's own note |
| Layer 2: Phase | COAXIAL ALIGNMENT | Slider - linear Component | 0 | 360 | No | Phase offset in degrees. No live Signal to modulate — see Layer 1: Phase's own note |
| Layer 2: Interval | COAXIAL PULSE WIDTH | Slider - linear Component | 0 | 1 | No | Only displayed when Type is BURST (pulse) — see Layer 1: Interval's note |
| Layer 3: Type | HARMONIC GEOMETRY | Radio Button Component | N/A | N/A | No | Options: SWEEP, GRADIENT, KINETIC, BINARY, BURST |
| Layer 3: Gain | HARMONIC SATURATION | Slider - linear Component | 0 | 2 | Yes | Linear scaling for held level ratio. 0 also mutes the layer — see Layer 2: Gain's own note. Carries an inline Lane + Depth `LfoLink` — see Layer 1: Gain's own note |
| Layer 3: Detune | HARMONIC DRIFT | Slider - centered zero Component | -50 cents | +50 cents | Yes | Linear scaling for held level ratio. Carries an inline Lane + Depth `LfoLink` — see Layer 1: Gain's own note |
| Layer 3: Phase | HARMONIC ALIGNMENT | Slider - linear Component | 0 | 360 | No | Phase offset in degrees. No live Signal to modulate — see Layer 1: Phase's own note |
| Layer 3: Interval | HARMONIC PULSE WIDTH | Slider - linear Component | 0 | 1 | No | Only displayed when Type is BURST (pulse) — see Layer 1: Interval's note |
| **DRAWER** | RESONATOR *(placeholder lore word)* | Accordion Container | N/A | N/A | No | Source's fourth subsection (`busFilter`): the robot's bus filter, exposed by Robot Articulation (roadmap 50.1) |
| Cutoff | RESONATOR BAND *(placeholder lore word)* | Slider - log Component | 20 Hz | 20000 Hz | Yes | `audioAttributes.filterFreq` (`BUS_CUTOFF_SCHEMA`); live through `AudioEngine.updateRobotBusFilter`. Carries an inline Lane + Depth `LfoLink` for the `bus.frequency` target, held off by the Audio Load dial (`busFilterLinksHeldOff`) |
| Resonance | RESONATOR PEAK *(placeholder lore word)* | Slider - log Component | 0.1 | 20 | No | The filter's Q: `audioAttributes.filterQ` (`BUS_RESONANCE_SCHEMA`), absent = 1 |
| Type | RESONATOR MODE *(placeholder lore word)* | Radio Button Component | N/A | N/A | No | Low-pass, Band-pass, High-pass (lore: Sink, Channel, Skim). `audioAttributes.filterType` (`BUS_FILTER_TYPE_SCHEMA`), absent = Low-pass |
| **LFO LINK** | SIGNATURE LANE | `LfoLink` (Radio Button, inline per Gain/Detune row, and under Cutoff) | N/A | N/A | N/A | Picks one of 4 world lanes or Off (`ui.lfoLane`: Off, Core LFO/Apex Signature, Companion LFO/Lateral Signature, Accent LFO/Impulse Signature, Overtone LFO/Canopy Signature). Rendered directly beneath each linkable field — no separate "Modulation" accordion. Shape/Rate/Rate Drift/Depth Drift live on the lane itself, not per field — see `docs/AUDIO_SYSTEM.md`'s LFO Modulation section and Fleet Params → LFO Bank |
| LFO Link Depth | — | `LfoLink` (Slider - linear, inline per Gain/Detune row, and under Cutoff) | 0% | 100% | N/A | This field's own modulation intensity from its linked lane |

There is no separate shape/rate per field, and no OSCILLATION STATE / "LFO Active" toggle at the field level — a field's own "off" state is `lane: null` on its `LfoLink` (`src/types/lfo.ts`'s `LfoLink`), driven through `robotOptionsActions.ts`'s `applyLayerLfoLink` for a user edit.

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

## Loading ranges by theme and aspect (roadmap 57, the off screen)

Every seeded robot value above is drawn into a **band** from one table, `src/data/bands/` (`docs/specs/OFF_SCREEN.md` assumption 15; `docs/AUDIO_SYSTEM.md`'s "The band table"): `classic.ts` holds the Classic bands — the seeded ranges, lit shares and toggle thresholds this grid's Notes column names, lifted byte for byte and then drawn even by Even Seeded Draws (`docs/specs/EVEN_SEEDED_DRAWS.md`, 2026-11-02), which reset the fitted lit shares to their targets — and `spawnSystem.ts` and `robotFieldDerivation.ts` read each at the point of the draw through `getBand(key)`. The world's **theme** (`themes.ts`, picked on the off screen's Loading axis) is a column that replaces whole bands for the keys it names, on assumption 16's v1 key list, and leaves the rest Classic's; an **aspect** (`aspects.ts`) is a column over its own family's keys only — Melody, Envelope, Distance or Voice — seated per robot by the deal (`docs/COMPANIES.md`, "The deal") and applied by re-deriving that family's fields from the robot's own spawn index under the aspect's bands (`deriveMelodyFields`, `deriveEnvelopeFields`, `deriveSendFields`, `deriveVoiceFields`), so a dealt robot is exactly what it would have been had it spawned under the aspect. `Robot.loadedUnder` records the aspect each family dealt a robot; the robot screen's and company screen's "Loaded Under" line shows it. The global rows a theme moves (the tempo and the Low-Pass cutoff) are in `GLOBAL_CHAIN_GRID.md`'s own section. `themes.ts` and `aspects.ts` are the mechanical transcription of the five tables below (the themes, then one per family); `resolveBands.test.ts` pins every column to its key list and inside the field's full range.

**Status (2026-10-31):** the numbers are the plan's Task 34 placeholders, which Crawford's listen (`docs/tasks/OFF_SCREEN.md` Task 35) kept as built. A dash means the theme leaves that band Classic's.

**Themes.** A range band is `min–max`; a lit band (`SendBand`) is `min–max · lit`, the share of fresh robots that draw from the range (the rest seed the field's plain value: a linear curve with the plain Attack / Release band, a send of exactly 0). Every draw inside a band is even (`getUniformSeededVal`), the detunes centred, so a band's edges are reached and a lit share is the share of robots it says.

| Band key | Row above | Classic | Calm | Bold | Adventurous | Perilous |
|---|---|---|---|---|---|---|
| `robot.rhythmicDensity` | Density | 0–100 | 0–55 | 40–90 | — | 70–100 |
| `robot.rests` | Rests | 10–60 | 30–70 | 5–35 | 0–80 | 0–20 |
| `robot.attack` | Attack, s (a linear-curve robot) | 0–2 | 0.15–2 | 0–0.4 | — | 0–0.15 |
| `robot.release` | Release, s (a linear-curve robot) | 0–2 | 0.4–2 | 0–1 | — | 0–0.6 |
| `robot.shapedAttack` | Attack, s, of a robot whose Attack Shape is not Linear · the share of robots that are | 0.03–0.25 · 0.155 | — | 0.03–0.12 · 0.4 | 0.03–0.25 · 0.35 | 0.03–0.1 · 0.5 |
| `robot.shapedRelease` | Release, s, of a robot whose Release Shape is not Linear · the share | 0.15–0.8 · 0.15 | — | — | 0.15–0.8 · 0.4 | 0.15–0.4 · 0.4 |
| `reverbSend` | Reverb (0–1) · share carrying it | 0.1–0.6 · 1 | 0.3–0.6 · 1 | 0.1–0.35 · 1 | 0.05–0.8 · 1 | 0.05–0.3 · 1 |
| `delaySend` | Delay (0–1) · share carrying it | 0–0.3 · 0.75 | 0.1–0.3 · 0.75 | 0–0.2 · 0.6 | 0–0.5 · 0.75 | 0–0.15 · 0.5 |

**Melody aspects.** The family's four keys. A toggle band (`ToggleBand`, Motif Length and Note Variance) is `offShare · min–max`: a draw under `offShare` lands the field off (0), the rest maps uniformly onto the whole numbers of the span (`seedToggleValue`). The Classic column is what an as-theme robot draws under Classic; under another theme the Density band is that theme's (above) and the other three stay Classic's, since no theme column names them.

| Band key | Row above | Classic | Hypnotic | Mechanical | Wandering |
|---|---|---|---|---|---|
| `robot.rhythmicDensity` | Density | 0–100 | 40–60 | 70–95 | 20–50 |
| `robot.noteVariance` | Note Variance | 0.15 · 1–8 | 0 · 1–2 | 0 · 1–3 | 0 · 6–8 |
| `robot.rhythmicMotifLength` | Motif Length | 0.15 · 1–8 | — | 0 · 6–8 | 0.85 · 1–8 |
| `robot.pitchRepeat` | Pitch Repeat | 0–100 | 50–100 | 30–70 | 0–30 |

- **Hypnotic** — a note or two, circled: the variance toggle always on and narrow (1–2 of the 8 indices), medium density, and a high Pitch Repeat so a tiled motif keeps its pitches. Motif Length is the theme's.
- **Mechanical** — a long motif always on (6–8 steps), narrow variance (1–3), high density: the same long cell, hardly a gap.
- **Wandering** — wide variance (6–8), the motif off on about 85 % of robots (and 1–8 when on), low-to-medium density and little repeat: free onsets over the measure, few pitches held.
- **No as-theme pick** (removed 2026-10-31, `docs/tasks/OFF_SCREEN_REVISIONS.md` Task 6): a family with picks deals one to every group, and a family with none leaves every robot on the theme's bands.

**Envelope, Distance and Voice aspects** (`docs/tasks/OFF_SCREEN_REVISIONS.md` Tasks 7 and 10, 2026-10-31). **Placeholders, not yet heard:** the revisions were built unattended, so these columns are the plan's starting guesses, waiting on Crawford's listen (that plan's Task 11). A lit band is `min–max · lit`; a dash leaves the band the theme's.

| Band key | Row above | Classic | Plucked | Swelling | Held |
|---|---|---|---|---|---|
| `robot.attack` | Attack, s (a linear-curve robot) | 0–2 | 0–0.03 | 0.3–1.2 | 0.02–0.15 |
| `robot.decay` | Decay, s | 0–2 | 0.1–0.6 | — | — |
| `robot.sustain` | Sustain (0–1) | 0–1 | 0–0.25 | 0.7–1 | 0.9–1 |
| `robot.release` | Release, s (a linear-curve robot) | 0–2 | 0.05–0.4 | — | 0.8–2 |
| `robot.shapedAttack` | Attack, s, of a shaped robot · the share | 0.03–0.25 · 0.155 | 0.005–0.04 · 0.5 | 0.3–1.2 · 0.4 | — |
| `robot.shapedRelease` | Release, s, of a shaped robot · the share | 0.15–0.8 · 0.15 | 0.1–0.4 · 0.6 | — | 0.8–2 · 0.275 |

- **Plucked** — struck at once (under 30 ms, the shaped band as short), a fast decay to a low sustain, a quick let-go, more robots shaped.
- **Swelling** — rises over 0.3–1.2 s, shaped or not, into a high sustain.
- **Held** — starts promptly, sustains in full and rings 0.8–2 s after, shaped or not.

| Band key | Row above | Classic | Near | Far | Remote |
|---|---|---|---|---|---|
| `reverbSend` | Reverb (0–1) · share carrying it | 0.1–0.6 · 1 | 0–0.1 · 0.3 | 0.45–0.8 · 1 | 0.65–0.95 · 1 |
| `delaySend` | Delay (0–1) · share carrying it | 0–0.3 · 0.75 | 0–0.05 · 0.1 | 0–0.1 · 0.3 | 0.35–0.6 · 1 |

- **Near** keeps both sends low and mostly unlit; **Far** sinks deep into the Reverb with little Delay; **Remote** sinks deep into both. A room's own size (`reverb.decay`, `delay.delayTime`) is a global band and a theme's, so Distance sinks robots into the rooms without lengthening them.

| Band key | Row above | Classic | Glassy | Woody | Hollow |
|---|---|---|---|---|---|
| `robot.waveform` | the voice's waveform and Layer 1–3: Type, weighted sine / square / triangle / sawtooth / pulse | 1 / 1 / 1 / 1 / 1 | 4 / 0.5 / 4 / 0.5 / 1 | 1 / 3 / 4 / 1 / 1 | 0.5 / 4 / 0.5 / 1 / 4 |
| `robot.filterFreq` | Cutoff, Hz, of a common (open) robot | 2000–8000 | 5000–9000 | 1200–3500 | 1500–5000 |
| `robot.accentFilterFreq` | Cutoff, Hz, of an accent robot · the accent share | 400–2500 · 0.2 | 400–2500 · 0.1 | — | 600–2000 · 0.45 |
| `robot.accentFilterQ` | Resonance of an accent robot | 3–8 | — | — | 6–12 |
| `robot.layerGain` | Layer 1–3: Gain · the share of Layers 2 and 3 sounding | 0.2–1.2 · 0.5 | 0.2–0.5 · 0.3 | 0.6–1 · 0.7 | — |

- **Glassy** leans sine and triangle under an open cutoff, with few dark accent robots and quiet partials; **Woody** leans triangle and square under a lower cutoff, with warm layers that mostly sound; **Hollow** leans square and pulse under a lower cutoff, with more robots on the resonant accent filter and a higher Q. The waveform is a `PickBand`: the draw takes the first waveform whose cumulative weight it falls under, so Classic's equal weights give each waveform a fifth of robots.
