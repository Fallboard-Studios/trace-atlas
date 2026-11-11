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
| Dynamics | PRESSURE SWING | Slider - linear Component | 0 | 100 | No | How much this robot's note velocities swing from one to the next (Robot Performance, roadmap 50.5). Stored as `robot.dynamics`, an integer 0–100 (`DYNAMICS_SCHEMA`, `robotOptionsConfig.ts`), no conversion. At value d, d % of notes move off the 0.6 baseline velocity by up to ±0.3 × d / 100: 0 is flat, 100 moves every note by up to ±0.3 (roadmap 58 R2a; it was 50 = the pre-50.5 sound). Seeded at spawn in `60–80` under Classic (the `robot.dynamics` band, `src/data/bands/classic.ts`; themes and the Performance family move it, see "Loading ranges by theme and aspect" below), rounded. Read on every note at trigger time; no melody regeneration. Not a swell attribute. Saved in sessions and share links (`dy`) when it differs from its seed |
| **DRAWER** | PING CONTROLS | Accordion Container | N/A | N/A | No | Parent container for ping controls |
| Density | PING DENSITY | Slider - linear Component | 0 | 100 | No | Percentage fill rate of the measure/motif (Roadmap Phase 6). Was a Stepper originally — converted early (clicking through 0-100 one increment at a time was too slow), this row was simply never updated until docs/specs/STEPPER_TO_SLIDER.md |
| Motif Length | PING LENGTH | Slider - linear Component | 0 | 8 | No | Repeating rhythmic motif length in 16th notes. `0` is the off state (no separate toggle) — was a Stepper+Toggle, min `1`, before docs/specs/STEPPER_TO_SLIDER.md |
| Note Variance | PING FREQUENCY VARIANCE | Slider - linear Component | 0 | 8 | No | `0`: unweighted random selection. `1`-`8`: slices pitch array length. `0` is the off state (no separate toggle) — was a Stepper+Toggle, min `1`, before docs/specs/STEPPER_TO_SLIDER.md |
| Octave Range Min | PING FREQUENCY RANGES (MIN) | Slider - linear Component | 1 | 7 | No | Minimum octave bound. Was a Stepper before docs/specs/STEPPER_TO_SLIDER.md |
| Octave Range Max | PING FREQUENCY RANGES (MAX) | Slider - linear Component | 1 | 7 | No | Maximum octave bound. Was a Stepper before docs/specs/STEPPER_TO_SLIDER.md |
| **PANEL** | ARTICULATION MATRIX | Directional Panel | N/A | N/A | No | The Composition section's labelled Articulation panel (`ARTICULATION_PANEL_SCHEMA`), after the Octave row; holds Rests and Accents (Robot Performance, roadmap 50.5) |
| Rests | PAYLOAD GAPS | Slider - linear Component | 0 | 100 | No | How often a note stops early and leaves a gap, and how deep the cut (a rest removes a quarter to three quarters of the note; never a skip). Stored as `robot.rests`, an integer 0–100 (`RESTS_SCHEMA`). Baked into the melody as `MelodyEvent.rest` by the post-pass `applyPerformanceMarks` from the seed's own performance stream, so the notes never move; an edit regenerates (`applyRests`). Since roadmap 58 R2b a cut note releases in 30 ms (or the robot's shorter release), so the gap is heard. Seeded in `0–10` under Classic (the `robot.rests` band, `src/data/bands/classic.ts`; themes and the Performance family move it, see "Loading ranges by theme and aspect" below). Saved (`rt`) when it differs from its seed |
| Accents | PAYLOAD STRESS | Slider - linear Component | 0 | 100 | No | How often a note carries one of the five classical marks (accent, marcato, staccato, staccatissimo, tenuto) and how many kinds are unlocked (tiers at 34 and 67, `unlockedMarks`). Stored as `robot.accents`, an integer 0–100 (`ACCENTS_SCHEMA`); baked into the melody as `MelodyEvent.mark` by the same post-pass. Since roadmap 58 R2a accent lifts velocity ×1.5, marcato ×1.65 at three quarters length, tenuto ×1.2, staccato half length, staccatissimo a quarter; a cut mark releases short like a rest (R2b). Seeded in `0–30` under Classic, so only accent and tenuto (the `robot.accents` band, `src/data/bands/classic.ts`; themes and the Performance family move it, see "Loading ranges by theme and aspect" below). Saved (`ax`) when it differs from its seed |
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
| Emitting | ACOUSTIC EMISSION ACTIVE | `AUDIBILITY_LABELS.emitting` | Card Status value (Roadmap 15.2) — true audibility (not muted, not excluded by another robot's Solo, and not in its station unless soloed), not just this robot's own audioMode |
| Disabled | ACOUSTIC EMISSION SUPPRESSED | `AUDIBILITY_LABELS.disabled` | Card Status value (Roadmap 15.2) |

## Loading ranges by theme and aspect (roadmaps 57 and 58, the off screen)

Every seeded robot value above is drawn into a **band** from one table, `src/data/bands/` (`docs/specs/OFF_SCREEN.md` assumption 15; `docs/AUDIO_SYSTEM.md`'s "The band table"): `classic.ts` holds the Classic bands, the seeded ranges, lit shares and toggle thresholds this grid's Notes column names, and `spawnSystem.ts` and `robotFieldDerivation.ts` read each at the point of the draw through `getBand(key)`. The world's **theme** (`themes.ts`, one of fourteen, picked on the off screen's Loading axis) is a column that replaces whole bands for any keys of the table it names and leaves the rest Classic's (`docs/specs/THEME_AND_ASPECTS_REFINEMENT.md` §1.5). An **aspect** (`aspects.ts`) is a column over its own family's keys only, one of six families: Melody, Envelope, Distance, Voice, Motion and Performance. The deal (`docs/COMPANIES.md`, "The deal") seats at most one option per family on each robot, and the robot re-derives that family's fields from its own spawn index under the option's bands (`deriveMelodyFields`, `deriveEnvelopeFields`, `deriveSendFields`, `deriveVoiceFields`, `deriveMotionFields`, `derivePerformanceFields`), so a dealt robot is exactly what it would have been had it spawned under the aspect. An aspect wins over the theme on its family's keys. `Robot.loadedUnder` records the option each family dealt a robot; the robot screen's and company screen's "Loaded Under" line shows it. The global rows a theme moves, and the lit rule for pedals and colour nodes, are in `GLOBAL_CHAIN_GRID.md`'s own section.

`themes.ts` and `aspects.ts` are the mechanical transcription of the seven tables below (the themes, then one per family). Each column names exactly its sheet's "Keys owned" in `docs/reference/THEME_AND_ASPECT_SHEETS.md`; the sheet sentence each key needs is in the notes under its table. `resolveBands.test.ts` holds every column to its key list, to its key's band kind and inside the field's full range.

**Status (2026-11-05):** the numbers as shipped after Crawford's listens, L1 to L3 (`docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md`, "Listen record"). What the generators realise under each column is measured by `npm run sketch:bands` and shown on `docs/sketches/theme-and-aspect-sketch.html`.

**Reading a cell.** A dash leaves the band Classic's (in a theme table) or the theme's (in a family table). A range band is `min–max`; a band of one value (`0–0`) pins the field. A lit band (`SendBand`) is `min–max · lit`: `lit` is the share of fresh robots that draw from the range, and the rest seed the field's plain value (a send of exactly 0, a linear curve with the plain Attack / Release band, the open filter, a quiet layer, no link), so a lit of 0 means no robot carries the trait. A toggle band (`ToggleBand`, Motif Length and Note Variance) is `offShare · min–max`: a draw under `offShare` lands the field off (0), the rest maps uniformly onto the whole numbers of the span (`seedToggleValue`); an off share of 1 is always off. A pick band (`PickBand`, the waveform and the octave register) lists each option's weight, zero weights left out: a robot lands on an option with its weight's share of the total. Every draw inside a band is even (`getUniformSeededVal`), the detunes centred, so a band's edges are reached and a lit share is the share of robots it says. The three effect-room sends roll in the order Grit, Shimmer, Double and a robot carries at most one (`composeExclusiveSends`), so a theme raising the Shimmer or the Double share realises less than its `lit` beside Classic's Grit share.

**The attack rail (2026-11-05).** `robot.rhythmicDensity` is the one band a robot does not always draw whole: a slow linear attack narrows it (`audibleDensityBand`, `robotFieldDerivation.ts`), so the mean gap between notes, at the top of the column's `bpm` band, carries the attack to `ATTACK_REACH_SHARE` (half) of its peak. Under Classic's tempo any attack over 0.3 s narrows the band, to 30 ÷ attack (a 1 s attack seeds 0–30); a cap under the band's bottom collapses the band onto the cap, so the rail wins over a dense column (Tumbling with Bowed). An Envelope pick re-draws the density against the dealt attack. The grid's density cells are the bands before the rail; `docs/MELODY_SYSTEM.md` has the rule.

**Themes.**

| Band key | Classic | Float | Anchor | Shatter | Undertow | Trench | Tidepool | Floe | Thicket | Wreck | Open Water | Vent Field | Beacon | Polar Low |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `robot.attack` | 0.015–2 | 0.3–0.8 | 0.015–0.015 | 0.015–0.015 | 0.2–0.6 | — | 0.015–0.02 | 0.5–1.5 | — | — | — | 0.015–0.03 | — | 0.015–0.02 |
| `robot.decay` | 0–2 | — | 0.05–0.3 | 0.02–0.15 | — | — | 0.02–0.15 | — | — | — | — | 0.05–0.25 | — | — |
| `robot.sustain` | 0–1 | — | — | 0–0.2 | — | — | 0–0.1 | 0.6–1 | 0.6–0.9 | — | — | 0–0.3 | — | — |
| `robot.release` | 0.02–2 | 1.5–2 | — | 0.02–0.1 | 1–2 | 1–2 | 0.02–0.15 | 1.2–2 | 0.8–1.6 | — | 1–2 | — | — | 0.02–0.2 |
| `robot.shapedAttack` | 0.03–0.25 · 0.155 | — | — | — | — | — | 0.015–0.05 · 0.155 | 0.5–1.5 · 0.155 | — | — | — | — | — | — |
| `robot.shapedRelease` | 0.15–0.8 · 0.15 | — | — | — | — | — | 0.03–0.15 · 0.15 | 1.2–2 · 0.15 | — | — | — | — | — | — |
| `robot.portamento` | 0.05–0.2 · 0.125 | — | 0.05–0.2 · 0 | — | 0.15–0.35 · 1 | 0.15–0.4 · 0.75 | — | — | — | — | — | — | — | — |
| `robot.filterFreq` | 2000–8000 | 2000–4500 | — | — | — | — | — | — | 800–2500 | — | — | — | — | — |
| `robot.accentFilterFreq` | 400–2500 · 0.2 | — | — | 400–2500 · 0.05 | — | — | 400–2500 · 0 | — | — | 400–2500 · 0.5 | — | 250–900 · 0.9 | — | — |
| `robot.accentFilterQ` | 3–8 | — | — | — | — | — | — | — | — | — | — | 8–14 | — | — |
| `robot.layerGain` | 0.2–1.2 · 0.5 | — | 0.8–1.2 · 1 | — | — | — | 0.2–1.2 · 0 | — | 0.8–1.2 · 1 | — | — | — | — | — |
| `robot.detune` | −2 to 2 | — | 0–0 | −30 to 30 | — | — | — | — | — | — | — | — | — | — |
| `robot.masterVolume` | 0.65–0.85 | — | — | — | — | — | — | — | — | — | 0.45–0.65 | — | — | 0.8–0.95 |
| `robot.lfoDetuneDepth` | 1–10 · 0.25 | — | 1–10 · 0 | — | — | — | — | — | — | — | — | — | — | — |
| `robot.lfoBusDepth` | 1–40 · 0.135 | — | — | 1–40 · 0 | 5–25 · 0.6 | — | — | — | — | — | — | 20–60 · 0.8 | — | — |
| `robot.rhythmicDensity` | 0–100 | 0–40 | — | 80–100 | — | 0–30 | 35–65 | 0–35 | 30–60 | — | 0–30 | 60–90 | 20–45 | 70–100 |
| `robot.pitchRepeat` | 0–100 | — | — | — | — | — | — | — | — | 60–100 | — | — | 70–100 | — |
| `robot.rhythmicMotifLength` | 0.15 · 1–8 | 0.15 · 1–3 | — | — | — | — | — | — | — | 0 · 6–8 | — | — | 0 · 6–8 | — |
| `robot.noteVariance` | 0.15 · 1–8 | — | — | — | — | — | — | — | — | — | — | 0 · 5–8 | 0 · 1–2 | 0 · 5–8 |
| `robot.dynamics` | 60–80 | — | — | — | — | — | — | — | — | — | — | — | 0–15 | 75–100 |
| `robot.rests` | 0–10 | 40–80 | — | 0–8 | 0–5 | 50–85 | — | — | — | — | 50–90 | — | — | — |
| `robot.accents` | 0–30 | 0–15 | — | — | — | — | — | — | — | — | — | — | 0–0 | — |
| `robot.waveform` | sine 1, square 1, triangle 1, sawtooth 1, pulse 1 | sine 1, triangle 1 | square 1, triangle 1 | sawtooth 1, pulse 1 | triangle 1, sawtooth 1 | sine 1, triangle 1 | sine 2, triangle 1 | sine 3, triangle 1 | square 1, triangle 2 | square 1, sawtooth 1, pulse 1 | — | square 1, sawtooth 1, pulse 1 | — | — |
| `robot.octaveRegister` | bass 1, low 1, mid 1, high 1, treble 1 | — | — | high 1, treble 1 | — | bass 1, low 1 | — | — | — | — | — | — | — | — |
| `reverbSend` | 0.1–0.6 · 1 | 0.35–0.6 · 1 | 0.1–0.6 · 0 | 0.1–0.6 · 0 | — | 0.5–0.8 · 1 | 0.1–0.6 · 0 | 0.4–0.7 · 1 | 0.2–0.4 · 1 | — | 0.5–0.8 · 1 | — | 0.05–0.15 · 1 | — |
| `delaySend` | 0–0.3 · 0.75 | — | 0–0.3 · 0 | 0.2–0.4 · 1 | 0.15–0.35 · 0.9 | — | 0–0.3 · 0 | — | — | 0.3–0.5 · 1 | 0.3–0.5 · 1 | — | 0.4–0.6 · 1 | — |
| `gritSend` | 0.4–0.8 · 0.21 | 0.4–0.8 · 0 | — | 0.6–0.9 · 0.85 | — | — | — | — | — | 0.4–0.7 · 0.8 | — | — | — | 0.5–0.8 · 0.6 |
| `shimmerSend` | 0.2–0.5 · 0.16 | — | — | — | — | — | — | 0.4–0.7 · 0.85 | — | — | — | — | — | — |
| `doubleSend` | 0.3–0.6 · 0.19 | — | — | — | 0.4–0.7 · 0.85 | — | — | — | 0.4–0.7 · 0.85 | — | — | — | — | — |

- **Float** — `robot.attack` every note arrives slowly; `robot.release` and trails long; `robot.filterFreq` the probe filter open and warm; `robot.rhythmicDensity` each probe speaks seldom; `robot.rhythmicMotifLength` short gentle cells: a figure that is short when it is on; `robot.rests` and leaves long rests between phrases; `robot.accents` no note is pushed harder than another: no rhythmic push; `robot.waveform` soft voices: the sine and the triangle; `reverbSend` every probe in it; `gritSend` no probe sent to the Grit room: no drive, whatever node the coin lit
- **Anchor** — `robot.attack` an instant attack: the note lands; `robot.decay` a tight decay; `robot.portamento` nothing slides: no probe glides; `robot.layerGain` partner layers full: the stack is dense; `robot.detune` each probe's layers tuned dead on one another: the stack punches as one; `robot.lfoDetuneDepth` nothing wavers: no layer drifts against another; `robot.waveform` the square and the triangle; `reverbSend` no probe in the wash; `delaySend` none in the echo
- **Shatter** — `robot.attack` a hard strike; `robot.decay` short; `robot.sustain` holds little; `robot.release` gone at once; `robot.accentFilterFreq` nothing resonates: the accent filter off most probes; `robot.detune` each probe's layers tuned wide apart: the buzz beats against itself; `robot.lfoBusDepth` nothing sweeps: the probe filter does not move; `robot.rhythmicDensity` probes talk nearly all the time; `robot.rests` with hardly a rest: a wall, never gusting; `robot.waveform` the saw and the pulse; `robot.octaveRegister` set high in the register; `reverbSend` dry of wash; `delaySend` on every probe; `gritSend` most probes sent to the Grit room: a crunch on nearly every note
- **Undertow** — `robot.attack` notes arrive slowly; `robot.release` and release long; `robot.portamento` every probe glides over a long slide; `robot.lfoBusDepth` on many the probe filter wobbles gently; `robot.rests` run into each other with no rests; `robot.waveform` the saw and the triangle blended; `delaySend` most probes sent into it; `doubleSend` most probes sent to the Double room: water over the sound
- **Trench** — `robot.release` its notes fade long; `robot.portamento` most probes slur between notes rather than step, like a sonar sweep; `robot.rhythmicDensity` a probe speaks seldom; `robot.rests` and leaves long gaps between calls; `robot.waveform` its voice is round, with no edges; `robot.octaveRegister` and set low in the register: the deep; `reverbSend` every probe sunk deep in it
- **Tidepool** — `robot.attack` a droplet strikes; `robot.decay` settles at once; `robot.sustain` holds almost nothing; `robot.release` and is gone; `robot.shapedAttack` a probe that curves its start is kept as short as a plain one; `robot.shapedRelease` the same for its tail; `robot.accentFilterFreq` no probe is resonant; `robot.layerGain` one voice each, partners quiet; `robot.rhythmicDensity` a middling rate: the pool ticks; `robot.waveform` round, thin voices; `reverbSend` no wash; `delaySend` no echo
- **Floe** — `robot.attack` notes arrive slowly; `robot.sustain` hold; `robot.release` and ring long; `robot.shapedAttack` a curved probe arrives as slowly; `robot.shapedRelease` and rings as long; `robot.rhythmicDensity` probes speak seldom; `robot.waveform` the voices are pure; `reverbSend` every probe in it; `shimmerSend` most probes sent to the Shimmer room: a sheen on nearly every note
- **Thicket** — `robot.sustain` notes hold; `robot.release` and are let go slowly; `robot.filterFreq` under a probe filter brought down; `robot.layerGain` partner layers full and on; `robot.rhythmicDensity` a middling rate; `robot.waveform` the mellow and the square waveforms; `reverbSend` moderately in the wash; `doubleSend` most probes sent to the Double room
- **Wreck** — `robot.accentFilterFreq` more probes than usual on a resonant filter: some creak; `robot.pitchRepeat` the same notes returning; `robot.rhythmicMotifLength` a long fixed figure, always on; `robot.waveform` hard-edged voices; `delaySend` every probe sent into it; `gritSend` most probes sent to the Grit room: a grain on the notes
- **Open Water** — `robot.release` its notes fade long; `robot.masterVolume` each quieter than usual, as a far thing is; `robot.rhythmicDensity` probes speak seldom; `robot.rests` and leave long gaps: the silence is the room; `reverbSend` every probe deep in the reverb; `delaySend` and in the delay
- **Vent Field** — `robot.attack` short notes; `robot.decay` that settle fast; `robot.sustain` and hold little; `robot.accentFilterFreq` nearly every probe on the resonant filter, set low; `robot.accentFilterQ` with a sharp peak; `robot.lfoBusDepth` the filter sweeps on most of them; `robot.rhythmicDensity` probes speak often; `robot.noteVariance` a pitch that ranges wide; `robot.waveform` hard-edged voices
- **Beacon** — `robot.rhythmicDensity` a middling-low rate; `robot.pitchRepeat` returns to the same notes; `robot.rhythmicMotifLength` a long figure that is always on; `robot.noteVariance` keeps its pitch close, never off; `robot.dynamics` plays flat; `robot.accents` with no marks; `reverbSend` little wash; `delaySend` every probe sent into the delay
- **Polar Low** — `robot.attack` short hard notes; `robot.release` short; `robot.masterVolume` loud; `robot.rhythmicDensity` probes speak often; `robot.noteVariance` a wide-ranging pitch; `robot.dynamics` wide dynamics: surges and drops; `gritSend` many sent to the Grit room: the loud ones tear
**The aspect families.** A family's Classic column is what a robot with no pick in that family draws under Classic; under another theme the band a family leaves alone is that theme's.

**Melody.**

| Band key | Classic | Hypnotic | Mechanical | Wandering | Chanting | Tumbling | Telegraph |
|---|---|---|---|---|---|---|---|
| `robot.rhythmicDensity` | 0–100 | 40–60 | 70–95 | 20–50 | 60–80 | 85–100 | 5–20 |
| `robot.noteVariance` | 0.15 · 1–8 | 0 · 1–2 | 0 · 1–3 | 0 · 6–8 | 0 · 1–2 | 0 · 6–8 | 0 · 1–2 |
| `robot.rhythmicMotifLength` | 0.15 · 1–8 | — | 0 · 6–8 | 0.85 · 1–8 | 0 · 2–3 | 1 · 1–8 | 0 · 6–8 |
| `robot.pitchRepeat` | 0–100 | 50–100 | 70–100 | 0–30 | 75–100 | 0–15 | 40–60 |

- **Hypnotic** — `robot.rhythmicDensity` a middling, steady pace; `robot.noteVariance` keeps to a note or two, and the roaming is never off; `robot.pitchRepeat` comes back to the one it just left more often than not
- **Mechanical** — `robot.rhythmicDensity` speaks nearly all the time; `robot.noteVariance` holds its pitch close, and never off; `robot.rhythmicMotifLength` tiles one long figure and keeps tiling it: the figure is never off; `robot.pitchRepeat` comes round on the same notes most of the time (L2 R1, Crawford, 2026-11-04; was "about as often as it leaves it")
- **Wandering** — `robot.rhythmicDensity` speaks less often than most; `robot.noteVariance` ranges wide in pitch, never off; `robot.rhythmicMotifLength` almost never tiles a figure; `robot.pitchRepeat` rarely returns to the note it just left
- **Chanting** — `robot.rhythmicDensity` a brisk, even rate; `robot.noteVariance` keeps its pitch close, never off; `robot.rhythmicMotifLength` tiles a figure of two or three notes without end: short, and never off; `robot.pitchRepeat` comes back to the same notes nearly every time
- **Tumbling** — `robot.rhythmicDensity` speaks nearly all the time; `robot.noteVariance` ranges wide in pitch, never off; `robot.rhythmicMotifLength` never tiles a figure: always off; `robot.pitchRepeat` rarely returns to a note
- **Telegraph** — `robot.rhythmicDensity` speaks rarely; `robot.noteVariance` on one or two notes, never off; `robot.rhythmicMotifLength` a long fixed figure, never off; `robot.pitchRepeat` returning to them about as often as not

**Envelope.**

| Band key | Classic | Plucked | Swelling | Held | Bowed | Hammered | Breathing |
|---|---|---|---|---|---|---|---|
| `robot.attack` | 0.015–2 | 0.015–0.03 | 0.3–1.2 | 0.02–0.15 | 0.4–1.2 | 0.015–0.015 | 0.08–0.3 |
| `robot.decay` | 0–2 | 0.1–0.6 | — | — | — | — | 0.2–0.6 |
| `robot.sustain` | 0–1 | 0–0.25 | 0.7–1 | 0.9–1 | 0.75–1 | 0.95–1 | 0.1–0.3 |
| `robot.release` | 0.02–2 | 0.05–0.4 | — | 0.8–2 | 0.8–2 | 0.02–0.02 | 1–2 |
| `robot.shapedAttack` | 0.03–0.25 · 0.155 | 0.015–0.04 · 0.5 | 0.3–1.2 · 0.4 | — | 0.4–1.2 · 0.3 | 0.015–0.015 · 0.155 | 0.08–0.3 · 0.3 |
| `robot.shapedRelease` | 0.15–0.8 · 0.15 | 0.1–0.4 · 0.6 | — | 0.8–2 · 0.275 | 0.8–2 · 0.3 | 0.02–0.02 · 0.15 | 1–2 · 0.3 |

- **Plucked** — `robot.attack` strikes at once; `robot.decay` falls away quickly; `robot.sustain` to almost nothing; `robot.release` and lets go; `robot.shapedAttack` a probe that curves its start is kept as short as a plain one; `robot.shapedRelease` the same for its tail, so the pluck survives the curve
- **Swelling** — `robot.attack` rises slowly out of nothing; `robot.sustain` into a high held level; `robot.shapedAttack` plain or curved: a curved probe rises as slowly
- **Held** — `robot.attack` starts promptly, without a strike; `robot.sustain` sounds in full for as long as it lasts; `robot.release` rings on long after it is let go; `robot.shapedRelease` curved or plain: a curved tail rings as long
- **Bowed** — `robot.attack` drawn in slowly; `robot.sustain` holds high while it lasts; `robot.release` drawn out slowly after; `robot.shapedAttack` a curved probe is drawn in as slowly; `robot.shapedRelease` and out as slowly
- **Hammered** — `robot.attack` switches on at once; `robot.sustain` sounds in full for as long as it lasts; `robot.release` stops dead when it ends; `robot.shapedAttack` a curved probe switches on as fast; `robot.shapedRelease` and stops as dead
- **Breathing** — `robot.attack` comes in over a moment; `robot.decay` falls away; `robot.sustain` to a low level; `robot.release` and lingers after it is let go; `robot.shapedAttack` a curved probe comes in as slowly; `robot.shapedRelease` and lingers as long

**Distance.**

| Band key | Classic | Near | Echoing | Half-heard |
|---|---|---|---|---|
| `reverbSend` | 0.1–0.6 · 1 | 0–0.1 · 0.3 | 0.05–0.15 · 1 | 0.55–0.85 · 0.5 |
| `delaySend` | 0–0.3 · 0.75 | 0–0.05 · 0.1 | 0.4–0.7 · 1 | 0.2–0.4 · 0.5 |

- **Near** — `reverbSend` dry, with next to no wash: most probes carry none; `delaySend` almost never an echo
- **Echoing** — `reverbSend` only lightly into the reverb: repeats rather than wash; `delaySend` every probe sent deep into the delay: a call, and the call again
- **Half-heard** — `reverbSend` half the probes dry and present, half far off in the reverb; `delaySend` an echo on about half

**Voice.**

| Band key | Classic | Glassy | Woody | Hollow | Brassy | Muted | Chiming |
|---|---|---|---|---|---|---|---|
| `robot.waveform` | sine 1, square 1, triangle 1, sawtooth 1, pulse 1 | sine 4, square 0.5, triangle 4, sawtooth 0.5, pulse 1 | sine 1, square 3, triangle 4, sawtooth 1, pulse 1 | sine 0.5, square 4, triangle 0.5, sawtooth 1, pulse 4 | sine 0.5, square 1, triangle 0.5, sawtooth 5, pulse 1 | sine 4, square 0.5, triangle 3, pulse 0.5 | sine 1 |
| `robot.filterFreq` | 2000–8000 | 5000–9000 | 1200–3500 | 1500–5000 | 6000–10000 | 500–1200 | 6000–12000 |
| `robot.accentFilterFreq` | 400–2500 · 0.2 | 400–2500 · 0.1 | — | 600–2000 · 0.45 | 400–2500 · 0.05 | 400–2500 · 0 | 400–2500 · 0 |
| `robot.accentFilterQ` | 3–8 | — | — | 6–12 | — | — | — |
| `robot.layerGain` | 0.2–1.2 · 0.5 | 0.2–0.5 · 0.3 | 0.6–1 · 0.7 | — | 0.8–1.2 · 1 | 0.2–0.4 · 0.15 | 0.9–1.2 · 1 |

- **Glassy** — `robot.waveform` leans to the round waveforms; `robot.filterFreq` under a filter left wide open; `robot.accentFilterFreq` almost never one of the resonant ones; `robot.layerGain` partner layers quiet, so the fundamental rings alone
- **Woody** — `robot.waveform` leans to the mellow and the square waveforms; `robot.filterFreq` under a filter brought well down; `robot.layerGain` partner layers full and nearly always on
- **Hollow** — `robot.waveform` leans to the hard-edged waveforms; `robot.filterFreq` under a filter brought down; `robot.accentFilterFreq` nearly half the fleet is on the resonant filter; `robot.accentFilterQ` with a sharp peak
- **Brassy** — `robot.waveform` leans to the sawtooth; `robot.filterFreq` under a filter left open; `robot.accentFilterFreq` almost never one of the resonant ones; `robot.layerGain` partner layers full and always on
- **Muted** — `robot.waveform` leans to the round waveforms; `robot.filterFreq` under a filter brought right down; `robot.accentFilterFreq` none is resonant; `robot.layerGain` partner layers quiet and rarely on
- **Chiming** — `robot.waveform` a pure fundamental; `robot.filterFreq` under an open filter; `robot.accentFilterFreq` none is resonant; `robot.layerGain` partner layers ring loud above it and are always on

**Motion.**

| Band key | Classic | Gliding | Trembling | Sweeping |
|---|---|---|---|---|
| `robot.portamento` | 0.05–0.2 · 0.125 | 0.2–0.4 · 1 | 0.05–0.2 · 0 | 0.05–0.2 · 0 |
| `robot.lfoGainDepth` | 1–60 · 0.25 | 1–60 · 0 | 20–60 · 0.9 | 1–60 · 0 |
| `robot.lfoDetuneDepth` | 1–10 · 0.25 | 1–10 · 0 | 4–15 · 0.9 | 1–10 · 0 |
| `robot.lfoBusDepth` | 1–40 · 0.135 | 1–40 · 0 | 1–40 · 0 | 30–70 · 1 |

- **Gliding** — `robot.portamento` every one glides into every note over a long slide; `robot.lfoGainDepth` and in loudness; `robot.lfoDetuneDepth` the layers hold still in pitch; `robot.lfoBusDepth` the filter holds still: the slide is heard clean
- **Trembling** — `robot.portamento` no probe slides; `robot.lfoGainDepth` and in loudness; `robot.lfoDetuneDepth` the layers waver in pitch while a note holds, deep enough to hear; `robot.lfoBusDepth` and no filter sweeps: the tremor is heard clean
- **Sweeping** — `robot.portamento` no probe slides; `robot.lfoGainDepth` and in loudness: the sweep is the only motion; `robot.lfoDetuneDepth` the layers hold still in pitch; `robot.lfoBusDepth` a deep filter sweep rolls through every probe

**Performance.**

| Band key | Classic | Steady | Dramatic | Halting |
|---|---|---|---|---|
| `robot.dynamics` | 60–80 | 0–15 | 80–100 | 30–50 |
| `robot.rests` | 0–10 | 0–8 | 15–30 | 65–95 |
| `robot.accents` | 0–30 | 0–5 | 75–100 | 10–25 |

- **Steady** — `robot.dynamics` every note the same weight; `robot.rests` almost none is cut short; `robot.accents` none is marked
- **Dramatic** — `robot.dynamics` played loud and soft; `robot.rests` now and then a note cut short for effect; `robot.accents` nearly every note carries a mark, the hardest unlocked
- **Halting** — `robot.dynamics` the weight varies a little; `robot.rests` most notes cut short, the gaps deep; `robot.accents` the mild marks only
