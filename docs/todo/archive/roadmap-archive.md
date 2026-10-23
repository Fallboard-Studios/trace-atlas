# Roadmap Archive

Completed and cut phases moved out of [docs/todo/roadmap.md](../roadmap.md) to keep that file focused on what's still open. Phase numbers are preserved exactly as they were assigned in the live roadmap — never renumbered on archive — so every existing cross-reference (from `docs/specs/`, `docs/tasks/`, `docs/intent/`, and `docs/todo/roadmap.md`'s own stub for each phase below) stays valid. Entries appear in their original numeric order, not archive-date order.

## 0. LFO integration

### Create

- Tone.js LFO instance setup, lifecycle management, and signal routing node structures
- Typed getters and setters for LFO attributes (Shape, Rate/Frequency, Depth, Target Parameter Binding)
- Start/Stop/Sync lifecycle hooks for LFO nodes tied to the global audio transport

### Restructure

- Update synthesis layer interfaces to support dynamic parameter modulation inputs

### About

This phase constructs the underlying Tone.js LFO signal modulation core and parameter binding interface before any UI components or synthesis drawers are built. We are creating src/types/lfo.ts to define types for LFO modulation targets, oscillator shapes (Triangle, Sine, Square, Sawtooth), and frequency rate bounds. In src/engine/lfoEngine.ts, alongside the existing AudioEngine and beatClock modules, we are implementing Tone.js LFO node setup alongside pure getter and setter utilities (getLfoSettings, setLfoRate, setLfoDepth, setLfoShape, connectLfoTarget, and disconnectLfoTarget) to allow dynamic parameter modulation across synthesis layers. Finally, we are defining configuration defaults in src/data/lfoConfig.ts and adding unit tests in lfoEngine.test.ts to verify signal scaling and getters/setters in isolation before hooking them into React state or UI drawers in subsequent phases.

### Docs

- docs/AUDIO_SYSTEM.md has no LFO content today — add an "LFO Modulation" section documenting lfoEngine.ts's API alongside the existing AudioEngine API section.

## 1. Architecture & Components

### Create

- Data Files to hold content.
- Stepper Component
- Stepper with active toggle Component
- Slider - linear Component
- Slider - log Component
- Slider - centered zero Component
- LFO Component
- Radio Button Component
- Accordion Container
- Text Input Component
- Coords input Component
- Button Component
- Toggle Component
- Dual Label Component

### About

Combining Architecture and Components into a single initial step establishes a unified, type-safe Design System and Data Engine as our application's foundation. We are decoupling content from UI by authoring pure TypeScript configuration files in src/data/ (typed against core schemas in src/types/controls.ts), while constructing stateless primitive components in src/components/ui/ that accept these schemas as props. This means components like SliderLinear, StepperWithToggle, or DualLabel have zero hardcoded labels or domain logic, allowing us to build and test our complete UI atomic inventory up front before mapping it to domain drawers, session storage, or Web Audio logic. The "LFO Component" here is a UI control primitive (a labeled rate/depth/shape input) distinct from the Tone.js LFO signal engine built in Phase 0 — this component is what a drawer uses to display and edit the engine's state, not a reimplementation of it.

### Docs

- No existing doc covers this primitive/ControlSchema layer — add a new docs/COMPONENT_LIBRARY.md documenting the primitive inventory and the ControlSchema contract, and add it to CLAUDE.md's reference doc list.

### Forward Note

- Console Theming (Phase 11) will later drive CSS custom properties by *scale* — large/structural tokens (backgrounds) from the planet seed, small/accent tokens (buttons, text, borders) from the locale seed. Name and group new design tokens with that split in mind now, so Phase 11 doesn't have to rename or regroup anything this phase already established.

## 2. Layout

### Removal

- Remove most of transport (leave mute) and related code
- Remove existing hub nav
- Remove robot list from main layout
- Desktop is now just a large version of mobile; the tablet will not re-orient on desktop, remove desktop rules for layout, basically.

### Restructure

- Make sure transport/meta data component is sticky.
- Wire locale meta data up to data files, add it to UI
- Make sure time works correctly (based on planet size only)

### About

This phase strips out legacy layout logic to establish a unified, mobile-first application shell that renders identically across mobile, tablet, and desktop viewports without multi-column responsive re-orientation. We are removing redundant desktop layout rules, the main-screen robot list, legacy hub navigation, and non-essential transport controls—retaining only a global mute action. In their place, we are implementing a sticky metadata transport bar fueled by typed data files in src/data/localeMetadataConfig.ts, alongside a simplified time calculation engine in src/utils/planetTime.ts that derives time cycles strictly from planet size parameters, ensuring the interface layout remains locked, focused, and predictable across all devices.

### Docs

- docs/UI_SHELL.md's Overview lists `TransportBar`, `WorldView`, `RobotList`, and `Console` as what `ScreenViewport` renders — update once `RobotList` and most of `TransportBar` are gone.

## 3. Hub

### Removal

- Remove old hub nav
- Remove the Session and Composition console tabs and their placeholder stubs — Session becomes fully automated with no user-facing tile (its job is absorbed by the background persistence engine in Session Storage, Phase 12), and Composition is deferred to a future version

### Restructure

- Rewrite Hub Nav buttons, wire them up to content data files

### About

This phase replaces the legacy Hub navigation with a streamlined, data-driven navigation system that connects directly to our content files. We are stripping out all old hub navigation logic — including the Session and Composition stub tabs, which are dropped rather than rebuilt: Session's job is absorbed by Session Storage's background persistence engine (Phase 12), so there's nothing left for a tile to do, and Composition is deferred to a future version — and building a dedicated HubNav component container that maps over src/data/hubNavConfig.ts. Each button will be rendered using our schema-driven HubNavButton primitive, deriving its primary lore title, secondary human subtitle, and target screen directly from the strongly typed data file without any hardcoded labels or inline routing logic. The remaining hub tiles are Audio Rig (Phase 4), Sector Settings (Phase 5), and Robot Selection (Phase 8).

### Docs

- docs/UI_SHELL.md's "Planned Replacement: Hub Tiles" section becomes real for its tab→tile, surviving-tiles, and Session/Composition-dropped points — fold that content into "Console Navigation" (renaming the section) and delete the "not yet implemented" framing for those points specifically. The `robotOptions`/`robotEditor` points stay planned until Phases 7 and 9 land.

## 4. Audio Rig

### Create

- Update data files with all of those inputs
- Create layout

### About

This phase populates our data engine with the complete global audio processing inventory and builds the corresponding Audio Rig drawer interface — and, unlike earlier drafts of this phase assumed, wires it live rather than leaving it as a presentational scaffold. We are populating src/data/audioRigConfig.ts with strongly typed ControlSchema definitions for all seven global effect blocks, in signal-chain order (3-Band EQ, Low-Pass Filter, High-Pass Filter, Delay, Reverb, Compressor, and Limiter — Chorus was cut entirely partway through this phase, judged the wrong effect for this music, and Limiter added in its place), specifying precise logarithmic bounds, center-zero offsets, units, default values, LFO modulation flags, and lore/human label pairings. Using these schemas, we are constructing the AudioRigDrawer layout, utilizing Accordion containers for each effect module and mapping over parameter schemas with our UI primitives. Because the Web Audio side of this (AudioEngine.setGlobal*/setEffectBypass/setGlobalBypass, and lfoEngine for modulation) already exists from Phase 0, every control in the drawer is wired straight through to it — dragging a slider audibly changes the effect, and per-effect and rig-wide bypass toggles genuinely silence and visually disable their scope, rather than leaving that binding for a later phase. A Decay radio button, living inside the Compressor's own accordion under its other params, swaps the Compressor's position in the chain between "Natural Decay" (default — after Delay and Reverb, so their tails ring out uncompressed) and "Controlled Decay" (before both, tightening them). The seven parameters the grid flags LFO-modulatable each get a nested LFO control wired to lfoEngine (Limiter, Compressor, Reverb, and Delay's own delayTime never get one — no LFO target exists for any of them), and global LFO settings (shape/rate/depth, plus whether each one starts already active) are now seeded per planet the same way the rest of the global effect chain is — a planet can load with real modulation already audible before anything is touched. Each effect's own `enabled` state is genuinely seeded too, not forced on: every effect loads active except Delay, which has roughly a 1-in-4 chance of loading already bypassed.

## 5. Sector Settings

### Create

- Update data files with inputs
- Create Layout

### About

This phase defines the data configurations and layout for the Sector Settings view, allowing users to reseed the global planet environment and jump to specific plot coordinates. We are populating src/data/sectorSettingsConfig.ts with control schemas and preset lists for two main operational panels: Planet Calibration (seed entry, retransmit trigger, and promoted or random seed presets) and Plot Tuning (X and Y coordinate entry, retransmit trigger, and promoted or random locale presets). Using these schemas, we are building SectorSettingsDrawer.tsx to render a status readout header displaying the active plot and planet seed, followed by the calibration and tuning sections using our established UI primitives (TextInput, CoordsInput, Button, and DualLabel). All controls will draw their lore and human labels from the data config, creating a clean, schema-driven sector control panel ready for coordinate seeding logic in later phases.

### Known Issue

- Simplex noise collapses to a **low-entropy result at "clean" aligned coordinates** — not just `(0, 0)`, a whole class of coordinates. Verified directly against `simplex-noise`/`alea` with 8 different seeds: `(0, 0)` gave exactly `0` for all 8 (a true dead zone, every seed identical); `(0.5, 0.5)` gave only 3 distinct values across 8 seeds; `(1, 1)` gave 5; even `(3.7, -8.2)` only gave 6. A higher-precision, non-aligned point like `(12.3456, 67.891)` gave 8/8 distinct values. `localeStore.ts`'s `DEFAULT_LOCALE.coordinates` used to sit exactly on the worst case (`0, 0`) — now fixed to a verified-safe point — so the default locale's noise map was invariant to the planet seed, masked until now because the default planet name was itself a fixed literal ("Pelagos"), not because the locale ever actually varied. **This directly threatens Plot Tuning's X/Y coordinate entry (this phase's core feature)**: users naturally gravitate toward round numbers (`0`, `5`, `10.5`), which is exactly the coordinate class most likely to collide across different seeds/plots. Guard at input (reject/nudge round-number coordinates) or fix it structurally (hash/offset the sampling point so no user-typeable coordinate lands on a low-entropy region) — resolve as part of this phase's spec, not discovered again live with real users.

  **Resolved** — see [docs/specs/LOCALE_SEED_DECOUPLING.md](../specs/LOCALE_SEED_DECOUPLING.md); locale noise generation no longer samples through the planet's noise map, eliminating both the planet-coupling and the dead-zone collapse described above.

## 6. Robot Melody & Seed Engine

### Restructure

- ~~Update robot spawning rules so attributes come from planet agnostic lat/long coords seed~~ — **done, and generalized to all locale-derived content** (not just robot spawn attributes) via [docs/specs/LOCALE_SEED_DECOUPLING.md](../specs/LOCALE_SEED_DECOUPLING.md), pulled forward ahead of this phase.
- ~~Robot IDs become deterministic (derived from the seed + spawn index) instead of the current `crypto.randomUUID()`~~
- ~~Update all references to measure length to 16 16th notes~~
- ~~Density: Becomes a percentage. It fills X% of either the entire measure or a motif with that many notes~~
- ~~Motif Length: Number from 1 to 8 (in 16th notes) with an on/off toggle~~
- ~~Note Variance: Has an active toggle. When off, random notes with no weighting. When on, selects 1 to 8 notes from pitch array, weighted~~
- ~~Update localeStore.ts's normalization clamps for `rhythmicDensity`, `rhythmicMotifLength`, and `noteVariance`~~

**Done** — see [docs/specs/ROBOT_MELODY_SEED_ENGINE.md](../specs/ROBOT_MELODY_SEED_ENGINE.md). Scope ended up wider than this file list: `regenerateMelody.ts` and `RobotAudioTab.tsx` were also updated in the same phase, since both call the same `generateMelodyForRobot` API and would have gone stale otherwise.

### About

This phase refactors our core generation algorithms to establish a clean, pure TypeScript math engine, standardizing all measure structures to a fixed 16 sixteenth-note grid and updating robot spawning rules to derive attributes deterministically from planet-agnostic lat/long coordinate seeds, in place of the current planet+locale-coupled noise map derivation (see PROCEDURAL_GENERATION.md). In melodyGenerator.ts, we are implementing the new two-branch rhythm engine where Density acts as a 0 to 100% fill rate, interacting with an opt-in Motif Length (1 to 8 sixteenth notes — down from the current 1–16 range) that either scatters notes freely across the measure when toggled off or tiles and naturally truncates a repeating cell when toggled on. Finally, we are updating Note Variance to handle both unweighted random pitch selection when disabled and a weighted slice of 1 to 8 notes from the pitch array when enabled. Because localeStore.ts normalizes these same fields against the old ranges whenever locale state is written, we are updating its clamp logic in lockstep with the generator so a store write can't silently clamp a valid new-range value into the old one.

### Docs

- docs/MELODY_SYSTEM.md fully updated for: Density as a 0–100% fill rate (was a 4–12 onset count), Motif Length as a 1–8 on/off-toggled value (was a plain 1–16 slider), Note Variance as an on/off toggle, and the `RHYTHMIC_MOTIF_LENGTH_MAX` constant change (16 → 8).
- docs/PROCEDURAL_GENERATION.md — resolve its existing "Planned change" callout on the Locale map bullet now that lat/long seeding is planet-agnostic; update the two-tier planet+locale model description to match.

## 7. Robot Systems Engine

### Removal

- ~~Remove the current Robot Options console tab (robot count min/max slider, auto-spawn toggle) — the new Battery/Docking/Job lifecycle creates every robot once, rather than dynamically spawning and despawning them~~ — **done**. The UI tab itself was already dropped outright back in Phase 3; this phase retired the underlying machinery that outlived it (`startSpawnScheduler`/`stopSpawnScheduler`, the min/max "bounce" logic in `spawnRobot`, and `locale.settings`' `maxRobots`/`minRobots`/`autoSpawn`/`spawnFrequency` fields), plus `RobotsTab`'s "+ New Robot" button — none of it had a purpose once the roster is fixed and created once.
- ~~Remove the `persists` field from Robot and its "Persist" toggle in the robot meta editor — with robots never leaving or arriving under the new lifecycle, there is nothing for a robot to "survive" across a power-off cycle~~ — **done**.

### Create

- ~~Battery System (drain and recharge state)~~ — **done**.
- ~~Dock/Docking System (docked, docking, departing, active states)~~ — **done**.
- ~~Job System (assignment and status tracking)~~ — **done**.

**Done** — see [docs/specs/ROBOT_SYSTEMS_ENGINE.md](../specs/ROBOT_SYSTEMS_ENGINE.md). Scope ended
up wider than this file list, discovered during implementation rather than planning:
`powerController.ts` and `OceanScene.tsx` both called the retired scheduler/removal functions
directly and needed the same `stopRobotLifecycle()` swap `worldTransition.ts` got (required, not
cosmetic — `AudioEngine.killAll()`'s `resetBeatClock()` silently drops the tick's measure
subscription, so the swap is what makes a power cycle keep the lifecycle running, not just a
locale swap).

### About

This phase establishes the pure TypeScript domain models and state machines for autonomous robot behavior, and retires the spawn/despawn and persistence model they replace. We are extending src/types/Robot.ts to define interfaces for the Battery System (tracking drain rates, warning thresholds, and recharge cycles), the Docking System (an explicit state machine, following the existing RobotState const-object pattern, transitioning between docked, docking, departing, and active states), and the Job System (handling task assignments and status tracking). Because robots are now created once rather than dynamically spawned and removed, we are removing the existing RobotOptionsTab (robot count min/max slider and auto-spawn toggle) along with the `persists` field on Robot and its "Persist" toggle in the robot meta editor — neither has a purpose once nothing spawns or despawns after locale load. We will construct pure state utility modules in src/systems/robotSystems.ts to manage these state updates, timer loops, and status transitions deterministically, laying down the core mechanics ready to be hooked into session storage, UI readouts, and audio triggers in subsequent phases.

### Docs

- ~~docs/UI_SHELL.md's "Planned Replacement" point on `robotOptions` becomes real — fold it in and drop the "not yet implemented" framing for that point.~~ — **done**.
- ~~No existing doc covers robot lifecycle (Battery/Docking/Job) — add a new docs/ROBOT_LIFECYCLE.md, in the style of docs/MELODY_SYSTEM.md, documenting the state machines and src/systems/robotSystems.ts's API. Add it to CLAUDE.md's reference doc list.~~ — **done**, see [docs/ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md).

## 8. Robot Selection

### Restructure

- ~~SVG needs to ignore time/daylight, so each robot's avatar thumbnail stays visually consistent regardless of the active locale's time of day~~ — **done**, via `RobotBody`'s new `ignoreDaylight` prop.

### Create

- ~~Robot Selection hub tile: a list of every robot in the active locale, each entry showing its avatar SVG, job title, Audio Status (mute, solo, highlighted), and Battery Status~~ — **done**.
- ~~Selecting a robot navigates into the Robot Options screen (Phase 9), scoped to that robot, with a back button returning to this list~~ — **done, with a scope adjustment**: Robot Options (Phase 9) doesn't exist yet, so selection routes to `RobotEditorTab`, the same place today's list already routed to. Phase 9 will retarget it without this phase needing to change.

**Done** — see [docs/specs/ROBOT_SELECTION.md](../specs/ROBOT_SELECTION.md). Scope ended up wider
than this file list: the world-view click-through (clicking a robot in the ocean also opens this
tile, gated to the main hub grid state) required a `Console.css` pointer-events fix and a
`Robot.tsx` change, and unifying `AudioStatusBadge`'s new colors with `AccordionContainer`'s and
`PowerRockerSwitch`'s existing hardcoded status-light hex was folded in as one `statusLightColors.ts`
source rather than adding a fourth duplicated palette.

### About

This phase builds Robot Selection as one of the main hub tiles (see Phase 3): selecting it from the hub grid replaces the hub nav area with a list of every robot in the active locale, each rendered as a card. We are modifying the SVG avatar rendering logic to ignore global daylight/time calculations, ensuring each card's thumbnail reads consistently regardless of planet conditions. We are building RobotSelectionCard and AudioStatusBadge components in src/components/selection/ to display assigned job titles, dynamic battery status indicators, and diagnostic audio controls (mute, solo, and highlighted states) powered by typed parameter schemas in src/data/robotSelectionConfig.ts. All status badges derive their lore and human labels from the data layer. Selecting a card navigates into the Robot Options screen (Phase 9) scoped to that one robot, with a back button returning here. When in the main hub navigation state only, robots can be selected by clicking on them in the world view as well as through the robot list. 

## 9. Robot Options

### Removal

- ~~Remove every existing raw slider/input in the robot editor — the Audio Mode toggle group, rhythmic density/motif length/note variance sliders, and octave range slider in RobotAudioTab, and the per-layer waveform/gain/detune/phase/ADSR editors in RobotOscillatorsTab — replaced entirely by the Phase 1 primitives~~ — **done**. `RobotMetaTab`/`RobotAudioTab`/`RobotOscillatorsTab` deleted outright.
- ~~Remove per-layer ADSR envelopes — collapse Signature Array editing down to a single shared ADSR envelope per robot instead of one per oscillator layer~~ — **done**. `OscillatorLayer.adsr` removed from the type entirely; every layer's synth reads the one `audioAttributes.adsr` via `AudioEngine.reserveVoice`'s new required `adsr` parameter.

### Create

- ~~Update data files with inputs for all Robot Options drawers~~ — **done**, see `src/data/robotOptionsConfig.ts`.
- ~~Robot Display drawer~~ — **done, with the scope corrected via `/interview-me`**: Robot Name/Job Data/Battery Data (%)/Docked Status are read-only Dual Label rows (Phase 8's `RobotSelectionCard` pattern) with **no** job reassignment or docking-state override — both stay fully system-driven, correcting an earlier draft of this phase's own prose. Audio Setting (Off/Mute/Solo/Highlight radio) and transducer pressure ratio/Volume (LFO-modulatable, matching `ROBOT_DATA_GRID.md`'s Volume row) are the only editable controls.
- ~~Ping Controls drawer (rhythmic density, motif length, octave bounds, and a ping-reset action)~~ — **done**. Octave Range Min/Max ship as two independent Steppers (per `ROBOT_DATA_GRID.md`), not a dual-thumb slider. Reset Melody is a plain one-click `Button` — no confirmation dialog, for consistency with every other `Button` in the app.
- ~~Ping Contour drawer (single ADSR envelope)~~ — **done**. First-ever UI editing `audioAttributes.adsr` directly; edits call the new `AudioEngine.updateVoiceEnvelope` (no audio gap), never a full re-reservation.
- ~~Signature Array drawer (Baseline, Coaxial, and Harmonic oscillator layers, with LFO modulation frames and per-layer activation toggles)~~ — **done**. Fixed 3-layer array (no more dynamic add/delete); `'noise'` dropped as a selectable layer type; Detune is `±50` cents; Coaxial/Harmonic's Active toggle mutes a layer (excluded from the built composite voice) without discarding its configuration.
- ~~Every control in every drawer is paired with a Dual Label Component (Phase 1) to display its lore/human attribute name, sourced from robotOptionsConfig.ts~~ — **done**.

**Done** — see [docs/specs/ROBOT_OPTIONS.md](../specs/ROBOT_OPTIONS.md) and
[docs/tasks/ROBOT_OPTIONS.md](../tasks/ROBOT_OPTIONS.md). Scope ended up correcting this phase's
own earlier prose (via `/interview-me`), not just building what was drafted: job reassignment,
docking-state override, and a separate "battery warning threshold" field never existed in
`ROBOT_DATA_GRID.md` and were struck rather than built — see `docs/intent/robot-options.md`.
`RobotEditorTab.tsx` was renamed to `RobotOptionsTab.tsx` (it stopped being a tabbed "editor"),
which also required updating `ConsolePanel.tsx`'s import and `ConsolePanel.test.tsx`'s mocks.
`AudioEngine.reserveVoice` gained a required `adsr` parameter and a `filterActiveLayers` step —
placed on `reserveVoice` itself rather than only `reReserveVoice` (the spec's original phrasing),
since a robot's very first voice reservation happens in `spawnSystem.ts`, never `reReserveVoice`.

**Post-launch fixes, found during manual testing and code review, not part of the original 13
tasks:** Volume shipped as a 0–1 `SliderLinear` bound straight to `masterVolume`, baked into each
note's own velocity at schedule time — testing surfaced three real, compounding problems: (1) a
stale per-robot cache meant edits had no audible effect until a robot's next melody reload; (2)
`masterVolume: 0` didn't actually mute, since a velocity floor kept a faint level; (3) even once
live, an edit couldn't reach an already-scheduled/sounding note, since velocity is fixed the
instant a note triggers. The fix was an architecture change (confirmed with the user first, not
assumed): Volume moved off per-note velocity entirely onto each robot's own live per-robot bus
gain (`AudioEngine.reserveVoice`'s `masterVolume` parameter, `AudioEngine.updateRobotMasterVolume`)
— a continuously-live AudioParam, so an edit now affects anything currently sounding, including a
note's release tail. The UI display also moved from a raw 0–1 slider to 0–100% in 1% steps, and
the raw position is now passed through a perceptual/logarithmic taper
(`src/engine/audioEngine/volumeTaper.ts`) before becoming gain — a linear mapping felt nearly flat
across most of the fader's travel. Density (Ping Controls) shipped as the grid's literal `Stepper`
call but proved too slow to dial through a 0–100 range one click at a time, so it became a
`SliderLinear` instead. The Volume LFO was found to be silently inert at every setting — its
declared modulation range pinned its swing to exactly `0` regardless of rate/depth/shape (see
`AUDIO_SYSTEM.md`'s LFO Modulation section) — and Signature Array's Gain and Interval
sliders had the same missing-`step` bug Volume's original 0–1 toggle had, reachable at only 2–3
positions instead of a real range. Code review also caught Interval being shown (but inert) for
Binary/square layers — Tone.js has no width parameter outside `'pulse'` — corrected to Burst/pulse
only, in both the component and this phase's spec. Finally, `RobotDisplaySection` gained the same
sunlight/time-agnostic `RobotBody` avatar `RobotSelectionCard` already used, so Robot Options'
header reads consistently with the Robot Selection hub.

### About

This phase tears out the existing hand-built robot editor — RobotAudioTab's Audio Mode toggle group and density/motif/note-variance/octave sliders, and RobotOscillatorsTab's per-layer waveform/gain/detune/phase/ADSR editors — and rebuilds it as the Robot Options screen, reached by selecting a robot from the Robot Selection hub tile (Phase 8), scoped entirely to the currently selected robot. We are populating src/data/robotOptionsConfig.ts with parameter schemas for all four drawers and constructing dedicated components in src/components/robot/, each control paired with a DualLabel showing its lore and human attribute name. These include RobotDisplay for read-only Name/Job/Battery(%)/Docking-status display (unchanged from Phase 8's display pattern, no job/docking override, no gauge widget), plus editable Audio Setting (Off/Mute/Solo/Highlight) and an LFO-modulatable transducer pressure ratio slider; PingControlsDrawer for rhythmic density, motif length, octave bounds, and a ping-reset action; PingContourDrawer for a single logarithmic ADSR envelope — replacing the current per-layer ADSR editing, so a robot has one shared envelope instead of one per oscillator layer; and SignatureArrayDrawer for configuring Baseline, Coaxial, and Harmonic oscillator layers with LFO modulation frames and layer-activation toggles. All controls will consume schema definitions from our data configs, maintaining strict presentation logic while preparing the UI to connect directly to the underlying Robot Systems Engine (Phase 7).

### Docs

- ~~docs/UI_SHELL.md's "Planned Replacement" point on `robotEditor` becomes real — fold it in and delete the entire "Planned Replacement" section, since by this phase all of Phases 3/7/8/9 have shipped.~~ — **done**.
- ~~docs/ROBOT_DESIGN.md's Shape Parameters section describes spawn-time shape values as "the gain-weighted, normalized average of a robot's oscillator layers' ADSR envelopes" — with ADSR moved to a single shared envelope per robot, there's nothing left to average; reword to read directly from the one envelope.~~ — **done**.
- ~~docs/AUDIO_SYSTEM.md's "Layered / Composite Voices" section lists an optional per-layer `adsr` field on `OscillatorLayer` — update once ADSR moves off individual layers and onto the robot.~~ — **done**. Scope ended up wider than this one section: `AUDIO_SYSTEM.md`'s own `AudioEngine` interface listing (`reserveVoice`/`createCompositeVoice`'s signatures, the new `updateVoiceEnvelope`) and its LFO Seeding section (which had claimed robot-level LFO `active` was "purely a runtime UI concern never part of the generated data" — no longer true once this phase seeded it) both needed the same pass.
- docs/reference/ROBOT_DATA_GRID.md's Audio Setting Options column corrected to include "Off" (4th option, not the stale 3); Density's Min/Max corrected from `1`/`16` to `0`/`100` (stale since Roadmap Phase 6 shipped, never caught until this phase's spec research) — **done**, not part of the original Docs list but required for the grid to match shipped behavior.

## 10. Companies

### Create

- `src/types/Company.ts`: `Company` (`id`, `name`, `robotIds: string[]`, `lastEditedOptions?: CompanyOptionsSnapshot`) and `CompanyOptionsSnapshot`, mirroring every editable field the four Robot Options sections expose (Audio Setting, Volume + its LFO, Ping Controls, Ping Contour, Signature Array) — everything except the read-only Display rows (Name/Job/Battery/Docking) and the Reset Melody action, neither of which makes sense at company scope.
- `Locale.companies: Company[]` (src/types/locale.ts) alongside `robots`/`actors`, seeded once at spawn the same way the roster is — `spawnInitialRoster` (src/systems/spawnSystem.ts) gains a company-generation pass: a seeded count of 2-3 companies, each with a seeded 3-4 robots (disjoint, drawn from the 12-robot roster — leaving a meaningful chunk Freelance by default), each company given a generated name (the same Adjective+Noun word-list pattern `generateRobotName` already uses). Distinct from spawn generation, a new `MAX_COMPANIES = 6` constant (src/constants/index.ts) caps how many companies can exist at once, giving a player room to create more by hand via CRUD after spawn.
- `Robot.companyId?: string` (src/types/Robot.ts) — undefined means Freelance (the default; no separate boolean needed).
- `localeStore.ts` gains `addCompany`/`updateCompany`/`removeCompany`/`getCompanyById`, mirroring the existing `addRobot`/`updateRobot`/`removeRobot`/`getRobotById` pattern exactly. `removeCompany` clears `companyId` on every member robot first (mirrors `removeLocale`'s per-robot AudioEngine cleanup loop) — the "deleting a company frees its robots to Freelance" behavior this phase calls for.
- `uiStore.ts` gains `selectedCompanyId: string | null` (default `null`, the "None" button) and `selectCompany`, independent of `selectedRobotId` — company-glow and single-robot-select-glow are two separate, non-conflicting visual states, not a shared selection slot.
- A new `Select` primitive (`src/components/ui/controls/Select.tsx` + a `SelectSchema` variant in `src/types/controls.ts`) — the Design System's 14th primitive (`docs/COMPONENT_LIBRARY.md`, `CLAUDE.md`'s reference bullet, and `CONTROL_SCHEMA_TYPES`'s "all 13 variants covered" runtime assertion in `controls.test.ts` all updated to 14). Used for the robot→company assignment dropdown in both `RobotSelectionCard` and `RobotDisplaySection`, listing every company by name plus a "Freelance" option that clears `companyId`.
- `src/data/companyConfig.ts` — schemas for the company button row, the CRUD panel (Create/Rename/Delete, `TextInput` pre-filled with the generated name so a create action can be accepted as-is or edited before confirming), and the "Freelance" label, following the same typed-config-file convention every other drawer already uses.
- A new `CompanyOptionsPanel` component rendered by `RobotsTab` beneath the existing robot card list: the company button row (one button per company, capped at `MAX_COMPANIES`, plus "None"), the CRUD controls, and then the same four editable sections `RobotOptionsTab` uses — greyed out (`disabled`) with no bound value when "None" is selected, bound to the selected company's snapshot otherwise.

**Done** — see [docs/specs/COMPANIES.md](../specs/COMPANIES.md) and
[docs/tasks/COMPANIES.md](../tasks/COMPANIES.md). Shipped shape differs from this draft's naming in
a few places, none of them scope changes: `CompanyOptionsPanel` above shipped as three composed
components (`CompanyManager` mounting `CompanyButtonRow` + `CompanyCrudControls` +
`CompanyOptionsSection`), not one; company spawn generation is its own function,
`spawnInitialCompanies` (`src/systems/spawnSystem.ts`), called from `worldTransition.ts`'s
`initializeLocale` right after `spawnInitialRoster` rather than folded into it; and `localeStore.ts`
gained two more company actions than listed here — `getCompanyMembers` and the atomic
`assignRobotToCompany` (robot reassignment is a single cross-entity transition, not composed from
separate `updateRobot`/`updateCompany` calls at the call site, mirroring `removeCompany`'s own
shape). A real bug in `assignRobotToCompany` — re-selecting a robot's already-assigned company
silently dropped it from that company's `robotIds` — was found in code review before merge and
fixed with regression coverage; see `localeStore.test.ts`.

### Restructure

- `RobotDisplaySection`'s Audio Setting/Volume/Volume-LFO handlers and each of `PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`'s per-field handlers are extracted into shared pure functions (e.g. `applyAudioMode`, `applyVolume`, `applyDensity`, ...) that do exactly what today's inline handlers do — `updateRobot` plus whatever live `AudioEngine`/`lfoEngine`/`regenerateMelody` call already accompanies it. Both the existing single-robot drawers and the new `CompanyOptionsPanel` call the same functions; the panel's `onChange` handlers just loop them across `company.robotIds` instead of calling once. This is required, not cosmetic — a company-wide volume change that only wrote `updateRobot` without also calling `AudioEngine.updateRobotMasterVolume` per member would reproduce the exact stale-cache bug Phase 9's post-launch fixes already found and fixed for the single-robot case.
- `RobotSelectionCard` and `RobotDisplaySection` each gain a company row: `DualLabel` plus the new `Select`, defaulting to "Freelance," updating both the robot's `companyId` and the old/new company's `robotIds` via the store actions above on change.
- `Robot.tsx` (world view) adds a second CSS hook alongside `isSelected` — `isCompanyMember`, true when `robot.companyId === selectedCompanyId` and `selectedCompanyId !== null` — reusing the same glow treatment `.robot.selected` already defines rather than inventing a second visual language for "selected."

### About

This phase introduces Companies — user-managed groups of robots that let every Robot Options field be edited across many robots at once instead of one at a time, aimed squarely at the tedium of manually matching settings across several robots by hand (and trying to remember what was set last time) when tuning them to sound cohesive. A locale spawns with 2-3 companies of 3-4 robots each, seeded the same deterministic way everything else about a fresh locale is generated, leaving a meaningful chunk of the 12-robot roster Freelance by default — Companies read as a real, seeded part of the locale's identity from the moment it loads, not an empty feature waiting for manual setup; any robot not assigned is Freelance, the implicit default rather than a distinct flag. `MAX_COMPANIES` (6) is a separate CRUD ceiling on top of that, not the spawn target. Retransmitting a new seed in Sector Settings (Phase 5) regenerates Companies fresh along with the rest of the roster — nothing about a company survives a reseed, matching how nothing else does either, and reading as part of the same "new world" event lore-wise. We are extending `RobotsTab` (Roadmap Phase 8) with a company button row plus CRUD (create/rename/delete) beneath the existing robot card list, and a `CompanyOptionsPanel` beneath that reusing the same `RobotDisplaySection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer` primitives Robot Options (Phase 9) already built — with "None" selected, every control renders disabled with no bound value; selecting a company populates the panel from that company's own persistent snapshot (seeded from its first member's current values the first time it's edited, then updated field-by-field on every subsequent edit, so re-selecting a company later picks up exactly where its last edit left off) and every field edit fans out through the same `updateRobot`/`AudioEngine`/`lfoEngine`/`regenerateMelody` calls the single-robot drawers already make, once per member robot — a company edit is a broadcast, not a live link, so a user editing one member robot afterward changes only that robot, same as today. Selecting a company also highlights its members' cards in the list and glows them in the world view, reusing the existing single-robot selection visual rather than inventing a second one. Because the Design System's fixed 13-primitive inventory (Phase 1) has no dropdown, and both the robot list and Robot Options need one to reassign a robot's company, this phase adds a 14th primitive, `Select` — the first addition to that inventory since Phase 1 shipped it.

### Forward Note

- Session Storage (Phase 12) will need to persist Companies the same way it persists Robot Options overrides — `companies` alongside the per-robot override map, keyed by the same kind of deterministic ID `spawnSystem.ts` already gives robots (Phase 6), so a reload can reapply company membership and each company's snapshot rather than losing it. Nothing here needs to change for that; noted so Phase 12 doesn't discover it mid-implementation.
- That deterministic-ID matching only covers spawn-generated companies. A company created by hand via `CompanyCrudControls` has a `crypto.randomUUID()` id (deliberate — see `docs/COMPANIES.md`'s Forbidden Patterns list; there's no seed to derive it from) and doesn't exist in a freshly-regenerated roster at all, so it can't be reapplied as a diff the way robot overrides and spawn-companies can. Phase 12 must persist user-created companies as complete objects (id, name, robotIds, snapshot) in the save payload, not as an ID-keyed diff. The random id itself is fine for this — it only needs to stay stable once saved, not be re-derivable from the seed.

### Docs

- ~~`docs/COMPONENT_LIBRARY.md` updated for the 14th primitive (`Select`); `CLAUDE.md`'s reference bullet text ("The 13 stateless UI primitives") updated to 14.~~ — **done**.
- ~~No existing doc covers Companies — add a new `docs/COMPANIES.md`, in the style of `docs/ROBOT_LIFECYCLE.md`, documenting the `Company`/`CompanyOptionsSnapshot` shape, the seeded spawn-time generation, and the broadcast-not-link edit semantics. Add it to CLAUDE.md's reference doc list.~~ — **done**, see [docs/COMPANIES.md](../COMPANIES.md).
- ~~`docs/UI_SHELL.md`'s Robots tile description gains the company row/panel — it currently only describes the robot list.~~ — **done**.

## 10.1 Attenuation Style (single-planet reskin)

Inserted out of sequence — deliberately numbered 10.1 rather than renumbering every phase after it.

### Create

- `Locale` gains its own `dayStartTimestamp: number` (`types/locale.ts`), replacing the field of the same name currently on `Planet`. Computed at locale-build time (`buildLocale`, `worldTransition.ts`) directly from that locale's own `coordinates.x` — no seed, no shared clock: `dayStartTimestamp = Date.now() - (Math.abs(x % 24) / 24) * DAY_DURATION_MS`. `DAY_DURATION_MS` is a new fixed `6 * 60_000` constant (`constants/time.ts`), replacing the three-entry `PLANET_DURATION_MS` table. This makes "on load, current time is `abs(x % 24)` hours, zero minutes" true by construction for whichever locale is current, with no separate reconciliation step.
- New AS-seeded factory recolor path: today, factory hue/sat/greeble come *only* from the locale's own noise map via `generateFactoryId()` (`factoryPlacementSystem.ts`) — placement, count, and color are all locale-(x/y)-derived, and an AS-only retransmit never touches an already-populated locale's actors at all (`retransmitPlanetOnly`'s existing "same robots/actors/edits, no regeneration" behavior). Add a color component seeded from `getPlanetNoiseMap` (the same AS-seed source `generateGlobalAudioSettings`/`generateGlobalLfoSettings` already sample) and a dedicated pass that recolors an existing locale's factories in place — position/count/id untouched — triggered specifically by an AS-only retransmit. This is genuinely new coupling, not a rename: nothing today makes factory appearance react to a planet swap at all.

### Restructure

- **The retransmit branch that recalculates world time inverts.** Today, only a planet swap (`retransmitPlanetOnly`) produces a new `dayStartTimestamp`, and `retransmitCoordsOnly` explicitly preserves it (see that function's own comment in `worldTransition.ts`). Under this change it's the reverse: only a coordinate-changing branch (`retransmitCoordsOnly`, `retransmitBoth`) recalculates time, because it's the one building a fresh `Locale` (whose `dayStartTimestamp` is derived at construction, per Create above); the AS-only branch must leave the current locale's `dayStartTimestamp` alone entirely. Flagging explicitly because it's easy to get backwards if the new branch is written by analogy to today's structure.
- `PlanetView.tsx`'s per-second tick reads `dayStartTimestamp` off the current `Locale` instead of the current `Planet`, and computes the displayed hour directly from it — `computePlanetHour`'s size parameter and `computeLocalTime`'s longitude-offset composition (`constants/time.ts`) are both retired. There is no persistent, cross-locale clock to offset from (only one locale is ever mounted at a time via `currentLocaleId`); a locale's displayed hour is exactly the hour its own `dayStartTimestamp` implies, no second step.
- `SectorSettingsDrawer.tsx`'s "Planet Calibration" section becomes "Attenuation Style" in every user-facing string only — `PLANET_NAME_SCHEMA`'s `loreLabel`/`humanLabel`/`placeholder` and `PLANET_NAME_PRESETS` (`sectorSettingsConfig.ts`; the current Kryndara/Vessport Null/Halcyon Drift/The Rusting presets read as literal planet names and need reflavoring to receiver/attenuation-style names), plus `TransportBar.tsx`'s "Planet: {name}" status readout. `generateRandomPlanetName()` keeps producing the same 8-char alphanumeric string unchanged — it just no longer implies a place name. Internal identifiers (`Planet`, `PlanetSize`, `usePlanetStore`, `planetStore.ts`, `derivePlanetSeed`, `getPlanetNoiseMap`, `RetransmitInput.planetName`, the `?seed=`/`window.__GLOBAL_PLANET_SEED__` debug override) are deliberately **not** renamed — this stays a UI reskin, keeping the diff small, not a project-wide rename.
- Delete `PlanetSize` (`types/planet.ts`), `Planet.size`, `setPlanetSize` (`planetStore.ts`), and `planetInitialHour` plus its letter-average algorithm (`seedUtils.ts`) — all dead once the initial hour is x-derived rather than seed-derived.

**Done** — see [docs/specs/ATTENUATION_STYLE.md](../specs/ATTENUATION_STYLE.md) and [docs/tasks/ATTENUATION_STYLE.md](../tasks/ATTENUATION_STYLE.md). Confirmed shipped on `main`: `attenuationStyleStore.ts`, `AttenuationStyleView.tsx`, and `types/attenuationStyle.ts` all exist, `Locale.dayStartTimestamp` is live, and the internal-rename groundwork this phase deliberately left alone was picked up by 10.4 below.

### About

This phase reframes "visiting a different planet" as "retuning the receiver" — the user never leaves the one world; changing the Attenuation Style (AS) just changes how the same transmission is being interpreted. Mechanically this is closer to a reskin than a new feature: the exact seeded-generation pipeline that already drives Global Audio Rig timbre and Global LFO settings from a planet name (`generateGlobalAudioSettings`/`generateGlobalLfoSettings`, `globalAudioSeed.ts`) is untouched — it's retargeted to fire on an AS change instead of a planet change, with no change to *how* it generates. Robots, companies, and melodies are already purely locale-(x/y)-seeded and are confirmed unaffected by an AS change today, matching the requirement that melodies stay x/y-dependent. Two things do need real work, not just a rename: World Time drops the three planet-size options in favor of a fixed 6-minute day, with a locale's on-load hour computed directly from its own X coordinate rather than from the AS's seed — and because that ties time to the locale rather than the AS, `dayStartTimestamp` moves off `Planet` onto `Locale`, and the retransmit branch that recalculates it flips accordingly (coordinate changes now drive time; AS changes never do, the reverse of today). Factory *color* gains a new AS-seeded component so the backdrop's palette shifts with the receiver's interpretation, while factory *placement* stays exactly as locale/coordinate-derived as it is today — deliberately decoupled, since position is "where," not "how it's being read."

### Forward Note

- Two not-yet-built phases already describe "planet seed" as a design concept: Console Theming (Phase 11 — "planet seed drives large/structural tokens") and Session Storage (Phase 12 — "Active planet seed and plot coordinates" as item 1 of what gets persisted). Neither phase's design *logic* needs to change — the underlying seed mechanism (`getPlanetNoiseMap`, keyed by name) is untouched by this phase — but both should read "AS seed" by the time they're actually implemented, so they aren't built against stale terminology.

### Docs

- `docs/BUILDING_DESIGN.md` — the "seeded by the actor ID" description of factory color needs a follow-up note once this phase ships: color also depends on the AS seed, not only the locale's.
- No existing doc covers Sector Settings' user-facing renaming or the reworked World Time formula in one place — add one (or extend `docs/specs/SECTOR_SETTINGS.md`) and add it to `CLAUDE.md`'s reference doc list.

## 10.2 LFO Modulation Engine (Stacked LFO Drift)

Extends Phase 0's LFO engine with a second modulation layer; inserted here rather than renumbering every phase after it, same as 10.1. Source of intent: [docs/intent/lfo-drift.md](../intent/lfo-drift.md) (confirmed via `/interview-me`) — supersedes an earlier per-target draft of this phase that was reviewed and rejected before any of it was built (wrong file paths, and a per-target/per-drawer UI design the interview replaced with a single global control).

### Create

- One new **global** drift pair, not a `LfoSettings` field — `rateDrift`/`depthDrift` are Audio Rig-wide values (bipolar, roughly `-1.0`–`1.0`, default `0.0`, seeded per planet), not per-target/per-robot state, so they live in `GlobalAudioSettings`/`globalAudioSeedRanges.ts` alongside the rest of the Audio Rig's seeded fields, not on `LfoSettings` itself (`src/types/lfo.ts` is unchanged).
- `src/engine/lfoEngine.ts` — the actual file (a top-level sibling of `AudioEngine.ts`, **not** a member of the `src/engine/audioEngine/` subfolder, which holds only lower-level Tone helpers like `compositeVoice.ts`/`globalFx.ts`/`panning.ts`). At module init, lazily construct a **fixed pool of 8 shared hidden secondary `Tone.LFO`s** (0.03 Hz sine, ~33s cycle), each given a distinct, deterministic phase offset spread across the pool — not randomized (`Math.random()` has no place here per this module's existing `getSeededVal`-only convention), not one secondary oscillator per active primary. Whenever a primary LFO is connected (`connectLfoTarget`), it also connects to one pool oscillator — picked deterministically by hashing its own instance key, so the same target always lands on the same bucket — through its own small pair of `Gain` nodes (still per-primary; the swing has to scale relative to that primary's own current rate/range, which doesn't generalize across primaries the way the phase source does).
- Route each pool oscillator's per-primary-attenuated output into that `primaryLfo.frequency` (a `Signal`) and `primaryLfo.amplitude` (a `Param`) through the **same override-disable-then-restore sequence `connectLfoTarget` already uses** for its own target connections (`lfoEngine.ts`, the `signal.override = false` step before `.connect()`, then restoring the destination's pre-connect value after). `Tone.Signal`'s `override` flag resets the destination to `0` the instant anything `.connect()`s to it, regardless of gain staging — this is exactly the bug class `docs/AUDIO_SYSTEM.md`'s LFO Modulation section already documents as "the worst LFO bug found here," discovered once and fixed for the primary-to-target connections; the pool-to-primary connections are just as exposed to it and must reuse the fix, not rediscover it.
- **Depth Drift must never move a target off `0`.** Since `Depth Drift` is additive and bounded to stay non-negative, a naive implementation could still nudge a target whose own Depth is currently `0` (deliberately silenced) into brief audible modulation. Guard explicitly: a primary with base depth `0` gets no depth-drift connection at all, full stop — confirmed via interview as a deliberate rule, not an oversight to catch in review.
- Export `setGlobalLfoRateDrift`/`setGlobalLfoDepthDrift` (or equivalent) from the same `lfoEngine` object (plain exported object, no class, matching the module's existing shape) — these update the shared pool's gain-staging inputs for every currently-connected primary, not a single target's settings.
- `src/components/ui/controls/Lfo.tsx` is **not** touched by this phase — there is no per-target drift UI. Instead, one new accordion in `src/data/audioRigConfig.ts` (a sibling of the existing seven effect-block accordions, not nested inside any of them) holds exactly two `SliderCenteredZero` controls: Rate Drift and Depth Drift.

### Restructure

- `lfoEngine.ts`'s connection bookkeeping (`activeLfos`/`connectedSignals`) extended so a primary's disconnect path also tears down its pool-drift `Gain` pair — the shared pool oscillators themselves are never torn down (they're app-lifetime, not per-target).
- **No changes to** `src/types/lfo.ts`, `Lfo.tsx`, `src/data/robotOptionsConfig.ts`, `src/data/companyConfig.ts`, or `CompanyOptionsSection.tsx` — none of them have any per-target drift state to add, since drift is one global amount, not a per-`LfoSettings` field.

**Done** — see [docs/specs/LFO_DRIFT.md](../specs/LFO_DRIFT.md) and [docs/tasks/LFO_DRIFT.md](../tasks/LFO_DRIFT.md). Confirmed shipped on `main` as `src/engine/lfoDrift.ts` — since superseded in shape (not scope) by 10.3's 4-group reshape immediately below.

### About

This phase adds a second, hidden modulation layer over the *entire* set of currently-active Phase 0 LFOs at once — one global Drift control in the Audio Rig, not a per-drawer one — so sustained modulation reads as organic drift rather than a fixed, perfectly repeating cycle, without exposing a second raw oscillator sub-interface anywhere in the UI. A small fixed pool of 8 shared secondary oscillators, each at its own deterministic phase offset, stands in for "one drift oscillator per active LFO": with likely 70-100+ primaries bound in a typical session (most robot/global targets seed active), giving each its own dedicated secondary oscillator would meaningfully tax the audio thread for an effect nobody can actually hear as more "independent" past a handful of distinct phases — 8 buckets is enough that no two primaries read as synchronized, at a constant node cost that doesn't scale with how many LFOs happen to be active. Because `Tone.LFO`'s `frequency` is a `Signal` and `amplitude` is a `Param`, wiring a pool oscillator into either one hits the same `Signal.override`/`Param`-reset behavior `connectLfoTarget` already had to work around for its own target connections (`docs/AUDIO_SYSTEM.md`) — this phase reuses that fix rather than re-deriving it. Rate Drift/Depth Drift are planet-seeded, like the rest of the Audio Rig's values, so different Attenuation Styles feel like they drift by different default amounts without anyone touching a slider — the two sliders exist as an override, not a requirement. A silenced target (Depth already `0`) stays silent regardless of drift, by explicit design.

### Docs

- `docs/AUDIO_SYSTEM.md`'s "LFO Modulation" section — extend with the shared-pool signal graph (8 phase-offset secondary LFOs → per-primary `Gain` attenuators → each active primary's `frequency`/`amplitude`), the bipolar scaling math once defined, and the new global getter/setter API — plus an explicit note that the override-disable fix already documented there applies to these connections too.
- `docs/COMPONENT_LIBRARY.md` — no primitive-level change (no new component, `SliderCenteredZero` is reused as-is); note in `audioRigConfig.ts`'s own doc coverage (if any) that a Drift accordion exists alongside the seven effect blocks.

## 10.3 LFO Modulation Engine — Multi-Group Drift

Follow-up to 10.2, inserted the same way (out of sequence, not renumbering later phases). Confirmed via `/interview-me` — source of intent: [docs/intent/lfo-drift-groups.md](../intent/lfo-drift-groups.md).

### About

10.2 shipped "Stacked LFO Drift" scoped down to a single shared pool of 8 secondary oscillators and one global Rate Drift/Depth Drift pair applied uniformly to every LFO in the app. This phase builds the stack the name always implied: 4 independent drift groups — EQ3, Low-Pass Filter, High-Pass Filter, and one shared group for every robot-level LFO — each with its own dedicated oscillator pool (sized to that group's own real target ceiling, not a uniform 8), its own independently-seeded Rate Drift/Depth Drift amount, and its own pair of sliders in the Audio Rig. Every mechanic 10.2 already shipped — the deterministic bucket-hash assignment, the bounded swing math, the Depth Drift silence guard, the `Signal.override` fix reuse — carries over per-group unchanged; this phase restructures which pool a primary hashes into and which drift amount applies, not the underlying mechanism.

**Done** — see [docs/specs/LFO_DRIFT_GROUPS.md](../specs/LFO_DRIFT_GROUPS.md) and [docs/tasks/LFO_DRIFT_GROUPS.md](../tasks/LFO_DRIFT_GROUPS.md) (superseding 10.2's single-pool spec). Confirmed shipped on `main`: `src/types/lfo.ts`'s `DriftGroupId = 'eq3' | 'filterLPF' | 'filterHPF' | 'robots'` and `DRIFT_GROUP_IDS` match this section's own 4-group description exactly; `src/engine/lfoDrift.ts` implements the per-group pools.

## 10.4 Attenuation Style Internal Rename

Follow-up to 10.1, inserted the same way (out of sequence, not renumbering later phases). Raised
directly during review of 10.1's shipped state, not via `/interview-me` — source of intent:
[docs/intent/attenuation-style-rename.md](../intent/attenuation-style-rename.md).

### Restructure

- Reverses 10.1's own "internal identifiers are not renamed" constraint. Every "Planet"-named
  identifier, filename, and CSS class that means the Attenuation Style concept becomes
  `AttenuationStyle`-flavored, spelled out in full: `Planet` → `AttenuationStyle`, `usePlanetStore` →
  `useAttenuationStyleStore`, `derivePlanetSeed` → `deriveAttenuationStyleSeed`, `PlanetView.tsx` →
  `AttenuationStyleView.tsx`, `PLANET_NAME_PRESETS` → `ATTENUATION_STYLE_PRESETS`,
  `window.__GLOBAL_PLANET_SEED__` → `window.__GLOBAL_ATTENUATION_STYLE_SEED__`, and so on through
  `worldTransition.ts`'s own construction/retransmit helpers and `Locale.planetId` →
  `Locale.attenuationStyleId`. `DEFAULT_PELAGOS` keeps its own proper-noun name (only its type
  changes). `PlanetState` (dead, unused) is deleted rather than renamed.
- No behavioral change anywhere — confirmed no `getSeededVal`/`precomputeDataX` `dataId` string
  contains "planet," so this cannot affect any generated world's seed/determinism.

**Done** — see [docs/specs/ATTENUATION_STYLE_RENAME.md](../specs/ATTENUATION_STYLE_RENAME.md) and [docs/tasks/ATTENUATION_STYLE_RENAME.md](../tasks/ATTENUATION_STYLE_RENAME.md). Confirmed shipped on `main`: `attenuationStyleStore.ts`, `AttenuationStyleView.tsx`, and `types/attenuationStyle.ts` carry the renamed identifiers throughout.

### About

10.1 deliberately scoped itself to a UI/copy reskin, keeping "Planet" as the internal name of the
same concept "Attenuation Style" now fronts user-facing — flagged at the time as "a separate, later
unit of work." This phase is that work: closing the two-names-one-concept gap before it calcifies
into more call sites and docs that have to guess which name is "the real one."

### Docs

- `docs/CONSOLE_THEMING.md` and `docs/SESSION_STORAGE.md` — resolve 10.1's own Forward Note now:
  "planet seed" becomes "AS seed" in both, since the underlying identifier rename makes the old
  phrasing stale immediately rather than waiting for Phase 11/12 to actually be built.
- This section (`## 11`/`## 12` below) gets the same "planet seed" → "AS seed" terminology pass, for
  the same reason.
- Live reference docs (`PROCEDURAL_GENERATION.md`, `BUILDING_DESIGN.md`, `COMPANIES.md`,
  `UI_SHELL.md`, `CLAUDE.md`'s own doc-index blurbs) get their "planet"-as-AS-concept references
  updated to match. `docs/specs/ATTENUATION_STYLE.md`, `docs/tasks/ATTENUATION_STYLE.md`,
  `docs/intent/attenuation-style.md`, `docs/specs/SECTOR_SETTINGS.md`,
  `docs/specs/LOCALE_SEED_DECOUPLING.md`, and this roadmap's own `## 10.1` section stay untouched —
  historical record of what was decided at the time, including 10.1's own now-reversed
  no-rename call.

## 10.5 Company Assignment: Select → RadioButton

Inserted out of sequence, following 10.1–10.4's own precedent (not renumbering later phases). Not
derived from the roadmap draft — raised directly by Crawford during review, confirmed via
`/interview-me`. Source of intent: [docs/intent/company-assignment-radio.md](../intent/company-assignment-radio.md).

### Restructure

- The robot→company assignment `Select` dropdown, at both real call sites (`RobotSelectionCard`,
  `RobotDisplaySection`), replaced by `RadioButton` — Freelance first, then every company in order,
  the same option order `Select` already used. `assignRobotToCompany` and every other piece of the
  company data flow are unchanged; this is a control-type swap only.
- `Select` removed entirely — component, schema, tests — taking the Design System's live primitive
  count from 15 back to 14. `Select`'s own Phase 10 addition is undone; `DirectionalPanel`, added
  after `Select`, is unaffected and remains at 14 alongside the original 13.

**Done** — see [docs/specs/COMPANY_ASSIGNMENT_RADIO.md](../specs/COMPANY_ASSIGNMENT_RADIO.md) and
[docs/tasks/COMPANY_ASSIGNMENT_RADIO.md](../tasks/COMPANY_ASSIGNMENT_RADIO.md). Shipped as scoped —
`buildCompanySelectSchema` renamed to `buildCompanyAssignmentSchema` (returning a `RadioButtonSchema`),
both real consumers converted, `Select.tsx`/`.css`/`.test.tsx` deleted, `SelectSchema` removed from
`controls.ts`/`CONTROL_SCHEMA_TYPES`. One follow-up addition beyond the original scope, also
confirmed directly with Crawford mid-implementation: `RadioButton` now pops each option on
`mouseEnter`/`mouseLeave` too, matching `Button`'s own hover-pop feedback — reversing
[11.1.6](#1116-oblique-cabinetry-radiobutton)'s original "no hover/partial-pop on unselected
options" exclusion, and applying to every `RadioButton` consumer app-wide (the primitive has no
per-instance variant), not just the two company-assignment rows. See
`docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md`'s own post-ship amendment note and
`docs/COMPONENT_LIBRARY.md`'s `RadioButton` section for the up-to-date behavior.

### About

A UI preference against dropdowns for this one interaction, not a data-model concern — surfaced
while reviewing the app with the Oblique Cabinetry series (11.1.1–11.1.9) freshly in progress, which
is what caught the conflict with 11.1.8 (below) before that item's own work began.

### Docs

- `docs/COMPONENT_LIBRARY.md` updated: primitive count 15 → 14, `Select`'s table row and its own
  subsection removed.
- `docs/COMPANIES.md`'s "Company Membership" section updated for `RadioButton`.
- `CLAUDE.md`'s reference bullet needed no edit — it already read "14," stale since `DirectionalPanel`
  shipped (14→15, never updated), made accidentally correct again by this phase's own removal
  (15→14). See `docs/specs/COMPANY_ASSIGNMENT_RADIO.md` §1.5.

## 11. Console Theming — Cut

Originally scoped and shipped as one combined phase with a 2.5D "Oblique Cabinetry" rendering system for the interactive primitives, folded together because Cabinetry's face colors consume this phase's own seed-driven tokens directly. Split back into two separate roadmap items during scoping (confirmed via `/interview-me`, see [docs/intent/console-theming.md](../intent/console-theming.md)); this phase (seed-driven color tokens alone) was then fully implemented — `consoleTheme.ts`'s bounded HSL generation, `contrastRatio.ts`'s exhaustive WCAG-AA proof, `Tablet.tsx` wiring, the `Console.css`/`SleeveContainer.css` fixes — and evaluated against the real running app. **Cut at Crawford's call, not reverted for a bug**: the WCAG-safety-for-every-seed guarantee forced the structural tier into a narrow, same-y lightness band and pushed the accent tier too light/vivid to guarantee its own contrast margin — a tension structural to "provably safe for every seed" fighting "visually distinct per seed," not something a bounds-tuning pass could resolve. Replaced with a hand-picked static palette instead. Full retrospective, what was tried, and directions worth trying if this gets revisited: [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md). The original Create/Restructure/About/Docs sections describing the seed-driven design are preserved below the cut line for historical reference; treat them as describing what was tried, not current or planned behavior.

### Docs

- `docs/CONSOLE_THEMING.md` rewritten to record the cut, the reasoning, and what replaced it.
- `docs/intent/console-theming.md`, `docs/specs/CONSOLE_THEMING.md`, `docs/tasks/CONSOLE_THEMING.md` kept as-is, as a historical record of what was actually tried (bounds, variety technique, everything) — each now carries a pointer to the cut status rather than being rewritten.
- CLAUDE.md's reference-doc entry for `docs/CONSOLE_THEMING.md` updated to match.
- **Phase 11.1 originally described Cabinetry's face-shading as consuming this phase's *seed-driven* tokens — that premise no longer held once the tokens went static.** Resolved when 11.1 was split into the 11.1.1–11.1.5 series below: 11.1.1 now points face-shading at the actual static "Ballast" tokens (`--color-accent`/`--color-surface`) instead.

<details>
<summary>Original Phase 11 content (seed-driven design, as tried — historical reference only)</summary>

### Create

- Pure seed-to-theme module (e.g. src/utils/consoleTheme.ts, alongside seedUtils.ts/getSeededVal.ts) computing bounded, legible HSL values — large/structural tokens (`--color-bg`, `--color-surface`) from the active AS seed; small/accent tokens (`--color-accent`, `--color-border`) from the active locale's coordinate seed. `--color-text-primary`/`--color-text-muted` stay fixed, not seed-derived — legibility for the body/label text read throughout every drawer wins over full-palette variety.
- Wiring so retransmitting a seed in Sector Settings (Phase 5) recomputes and visibly updates the theme
- Respect `prefers-reduced-motion` on the retransmit transition (color change), following the same `@media (prefers-reduced-motion: reduce)` pattern already used in PowerRockerSwitch.css — the new theme still applies, it just snaps instead of animating

### Restructure

- The CSS custom properties in src/index.css (`--color-bg`, `--color-surface`, `--color-border`, `--color-accent`) become the seed-driven output target, replacing today's static Vite-default values. `--color-text-primary`/`--color-text-muted` are unchanged.

### About

This phase gives the console itself a seed-derived visual identity, split by scale rather than by physical part: the AS seed drives large/structural areas — large background regions inside the Glass — while the active locale's coordinate seed drives small accent elements wherever they sit, buttons/borders on the Glass-side chrome (body/label text stays fixed for legibility). Colors stay bounded and legible the same way robot color generation already is (see ROBOT_DESIGN.md), verified against WCAG AA (4.5:1 normal text / 3:1 large text/UI components) for every possible seed, not just typical ones — this is real interactive chrome sitting on a fixed dark background, not a decorative shape a bad roll can shrug off. Retransmitting a new seed in Sector Settings (Phase 5) visibly recolors the console, reinforcing the same "this is a piece of field equipment reporting what it's tuned to" fiction the rest of the console already leans on (SYSTEM_FIRMWARE_RESETS, the power-off confirm, etc.). Because the theme is a pure function of the seed and coordinates already being persisted by Sector Settings, it needs no separate storage of its own — Session Storage (Phase 12) restoring the seed automatically restores the look. Out of scope here: WorldView/terrain/sky styling (deferred to v2), robot visuals (locked to audio attributes per CLAUDE.md, untouched by this phase), the power rocker switch and the rest of the Sleeve casing (out of scope for now — see docs/CONSOLE_THEMING.md), and the Oblique Cabinetry rendering system itself (Phase 11.1.1–11.1.5).

</details>

## 11.1.1 Oblique Cabinetry: Foundation & Button

Split out of the original single "Oblique Cabinetry UI" item — which scoped all 7 Design System primitives (`Button`, `Toggle`, `SliderLinear`, `SliderLog`, `SliderCenteredZero`, `Stepper`, `StepperWithToggle`) plus the voxel-track slider rendering as one phase — into a sequence of smaller items, one per component, so each ships and reviews independently. `Stepper`/`StepperWithToggle` are dropped from Cabinetry scope entirely: neither has a live consumer today (`docs/COMPONENT_LIBRARY.md` — Phase 10.2 moved their former use cases to `SliderLinear`), so a cosmetic system for controls nothing renders isn't worth scoping now; revisit if either gets a real consumer again. This item also resolves a stale premise carried over from the original combined draft: face-shading consumes Console Theming's actual static "Ballast" tokens (`--color-accent`/`--color-surface`, `src/index.css`) rather than the seed-driven tokens Phase 11 shipped and then cut (see `docs/CONSOLE_THEMING.md`). **Done** — see [docs/intent/oblique-cabinetry-foundation.md](../intent/oblique-cabinetry-foundation.md), [docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md](../specs/OBLIQUE_CABINETRY_FOUNDATION.md), and [docs/tasks/OBLIQUE_CABINETRY_FOUNDATION.md](../tasks/OBLIQUE_CABINETRY_FOUNDATION.md). Confirmed shipped on `feature/cabinetry-foundation`: `CabinetBox.tsx`/`.css` and `Button.tsx`/`.css` carry the described behavior, including the pop-proportional glow and sharp front-face corners added after a real visual pass (not part of the original spec draft — see the spec's own § 1.8), plus a resize-flicker fix and a CSS/JS duplication collapse both found by a `code-review-and-quality` pass afterward (spec § 1.9 and § 1.3 respectively).

### Create

- **Cabinet-box rendering primitive**, shared by every remaining 11.1.x item — an SVG overlay stacked on a primitive's existing Radix/native element (`Slider.Root`/`Track`/`Thumb`, `Switch`/`Toggle` root, `<button>`), `pointer-events: none`, reading that element's own `value`/`checked`/focus state as props to drive its pop/fill animation. **The underlying interactive element stays exactly as-is and keeps doing 100% of the real interaction** — pointer events, drag, keyboard, focus ring, ARIA state — never owning a hit-area itself. Same technique `SliderCenteredZero` already uses for its zero-anchored fill (`docs/COMPONENT_LIBRARY.md`), generalized rather than reinvented. Opaque Top Face and Left Face `<polygon>`s anchor to a fixed footprint and GSAP-morph their points (~250ms, `power2.out`) to bridge the gap as the front face travels along a fixed 2:1 projection vector (2px right per 1px down); labels/text live inside the front face's own `<g>` so they slide with it for free. This *is* the "stationary hit box" the geometry needs — the front face slides as a pure visual while the real interactive element underneath never moves, which is what prevents hover flutter (an element sliding away from the cursor and re-triggering its own hover state), a side effect of keeping Radix in charge rather than a separate mechanism to build.
- **Face-shading** deriving the Top/Left Face polygons' lighter/darker fill from the existing `--color-accent` token via CSS `color-mix()`, computed at render time — no new CSS custom properties, no JS helper module (superseded this Create bullet's original `src/utils/cabinetShading.ts` illustrative filename; resolved as pure CSS during the spec pass, reusing `docs/specs/CONSOLE_THEMING.md § 1.3`'s own `color-mix()` precedent instead).
- **`Button` cabinet behavior**, the foundation's first real consumer: a single box per control. Box width is variable, sized to the button's own content; height is 32px (mobile) / 40px (tablet) / 48px (desktop). Off state rests fully flat (0px offset, side walls collapsed); active/hover/focus/click pops fully out along the 2:1 vector, a **fixed** magnitude (`CABINET_POP_DISTANCE` down, double that right — `src/utils/cabinetGeometry.ts`) — not scaled by box height, corrected after implementation once seen rendered (the original height-scaled version read as far too much protrusion at the 40/48px tiers), then tuned by feel more than once since. This doc doesn't restate the exact current distance — it's still being tuned; read the source constant, not this line, for the real number. The clickable/touchable area originally extended to cover the full popped-out footprint too (CSS padding, matching that fixed distance exactly — 2×/1× the constant, not the box height); **removed 2026-09-09** (confirmed via `/interview-me`, see `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.6`'s post-implementation correction) in favor of a static backing layer showing through a translucent popped facade — the hit target is now exactly the flat-state box, not the popped one. The front face carries no `border-radius` — sharp corners, added after a real visual pass, matching the walls' own straight-edged geometry (a rounded front panel on straight walls read as inconsistent once actually seen rendered); its background is accent-tinted (`--color-accent`), not surface-tinted, since it carries real text — also 2026-09-09, scoped to `Button` alone (`docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.4`'s correction).
- **Pop-proportional glow**, added the same visual pass: the walls (the "back" of the box, not the moving front face) glow via `filter: drop-shadow()`, scaled by a `--cabinet-glow` CSS custom property tweened `0→1` by the same GSAP timeline that drives the pop offset — so the glow tracks exactly how far the box has popped, not a separately-eased effect. Set on a shared wrapper element (not the front face) so the walls, a *sibling* of the front face rather than its descendant, can inherit it via CSS custom property cascade. Full rationale: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.8`.
- **No animation replay on a width/boxHeight-only change** — found by code review, not the manual visual pass (that kind of flicker only shows up on a *dependency* change during an *unrelated* interaction, e.g. resizing the window across a breakpoint while a button is still focused, which a pop-in/pop-out check alone won't exercise). `CabinetBox` now tracks the `popped` value its geometry effect last actually ran for and only replays the animated tween on a real transition; a dependency-only re-run repositions instantly instead. `Toggle`/the sliders inherit this fix for free via the shared primitive — worth remembering it needs to be *kept*, not silently lost if that effect shape gets copied and simplified. Full rationale: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.9`.
- **The breakpoint/pop-distance CSS duplication was collapsed to one JS source**, not just documented more carefully — also found by code review, after `CABINET_POP_DISTANCE` alone had gone stale in prose three times as it was retuned by feel. `CabinetBox` now applies `--cabinet-box-height`/`--cabinet-pop-distance` as inline custom properties computed directly from the JS constants; `CabinetBox.css` no longer redeclares either independently via `@media` rules. Full rationale: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.3`.

### Restructure

- `Button` (`src/components/ui/controls/`) re-renders internally through the cabinetry system — same `schema`/`onClick` props contract as today (`ControlSchema` union unchanged), so no domain config file needs to change.
- Every cabinet pop/collapse and wall-polygon morph runs as a GSAP timeline registered in `timelineMap` (`setTimeline`/`killTimeline`), following `AccordionContainer`'s existing pattern (`docs/COMPONENT_LIBRARY.md`) — no timeline state in Zustand or React state, and (per CLAUDE.md's Strict Separation guardrail) the timeline only drives the cosmetic pop/morph, never calls `AudioEngine` — `onClick` still fires straight from the native `<button>`'s own handler, since the underlying interactive element never changed.

### About

Establishes the cabinet-box visual language — flat and inert at rest, extruding toward the user when active — as a reusable mechanism rather than a per-primitive reimplementation, proved out on the primitive with the least surface area (one box, two states, no voxel-track) before 11.1.2–11.1.5 each wire it into a more involved primitive. The stationary-hit-box rule (front face slides, back frame never does, and only the back frame is ever listened to) is the load-bearing constraint that keeps hover state stable during the slide animation — a correctness rule, not a style preference, and true of every later item too. `CabinetBox` as shipped — geometry, face-shading, glow, and sharp corners together — is the reference example every later 11.1.x item's own cabinet box should match, confirmed explicitly by Crawford after a real visual pass, not just the geometric fundamentals. Out of scope here: `Toggle` and every slider (11.1.2–11.1.5), `Stepper`/`StepperWithToggle` (dropped, see above), the actual per-row box-count/layout question (resolved by 11.1.3's self-fitting box count, not deferred to a separate later phase after all), WorldView/terrain/sky styling, robot visuals (locked to audio attributes per CLAUDE.md), and the power rocker switch/`SleeveContainer` (out of scope for now — see `docs/CONSOLE_THEMING.md`).

### Docs

- `docs/CONSOLE_THEMING.md` gains the cabinet geometry/projection-vector/face-shading/glow rules — done, shipped alongside `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md`.
- `docs/COMPONENT_LIBRARY.md` gains a note once this item ships: `Button`'s internal rendering changed (cabinet SVG/GSAP instead of flat markup) while its `ControlSchema`/props contract stayed identical — done.

## 11.1.2 Oblique Cabinetry: Toggle

Wires `Toggle` into the cabinet-box mechanism 11.1.1 built — the second and last single-box (non-voxel-track) consumer. Depends on 11.1.1 having shipped. **Done** — see [docs/intent/oblique-cabinetry-toggle.md](../intent/oblique-cabinetry-toggle.md), [docs/specs/OBLIQUE_CABINETRY_TOGGLE.md](../specs/OBLIQUE_CABINETRY_TOGGLE.md), and [docs/tasks/OBLIQUE_CABINETRY_TOGGLE.md](../tasks/OBLIQUE_CABINETRY_TOGGLE.md). Confirmed shipped on `main` (PR #431): `Toggle` renders through `CabinetBox` as described below, and `CabinetBox` itself gained the `boxHeight`/optional-`children` additions this item needed — both later reused unchanged by 11.1.3's `VoxelTrack`.

### Create

- **`Toggle` cabinet behavior**: the same single-box pop/flat mechanism as `Button` (11.1.1) — same footprint math, same fixed 2:1 vector (`CABINET_POP_DISTANCE`-based, not scaled by box height — see 11.1.1's own correction above), same flat-footprint hit area (11.1.1's 2026-09-09 correction removed the padding-based extension for both — see above), **same pop-proportional glow and sharp (no `border-radius`) front-face corners** (11.1.1's `CabinetBox` already provides both for free via the shared primitive — nothing Toggle-specific to build for either; Toggle's own bare, textless box keeps the `--color-surface` default rather than `Button`'s accent-tinted override) — but keyed off the control's `checked`/`active` value instead of a momentary click. Popped-out is the resting "on" state, not a transient click response; flat is "off."

### Restructure

- `Toggle` (`src/components/ui/controls/`) re-renders internally through the cabinetry system — same `schema`/`value`/`onChange` contract as today. Its existing `isActive` CSS hook (`docs/COMPONENT_LIBRARY.md`) continues to reflect the same `active` value the cabinet box now also reads.
- Same `timelineMap` registration and Strict Separation constraint as 11.1.1 — `onChange` still fires straight from Radix's `Switch`/toggle root, never from the cabinet timeline.

### About

Confirms the foundation generalizes past its first consumer with no new mechanism, only a different state source (`checked` vs. a momentary click) — the real test of whether 11.1.1's primitive is actually reusable rather than Button-shaped. Out of scope here: every slider (11.1.3–11.1.5), `Stepper`/`StepperWithToggle` (dropped, see 11.1.1), and the same layout/WorldView/robot-visual/Sleeve exclusions as 11.1.1.

### Docs

- `docs/COMPONENT_LIBRARY.md` gains the same "internal rendering changed, contract didn't" note for `Toggle` once this item ships.

## 11.1.3 Oblique Cabinetry: SliderLinear (Voxel-Track Foundation)

Wires `SliderLinear` into the cabinet-box mechanism and, alongside it, builds the voxel-track rendering shared by all 3 sliders (`SliderLinear`, `SliderLog`, `SliderCenteredZero`) — a genuinely different rendering shape from Button/Toggle's single box, so it's built once here rather than three times. 11.1.4 and 11.1.5 each wire this same voxel-track system into their own primitive as thin follow-ups. Depends on 11.1.1 having shipped (reuses its cabinet-box primitive and face-shading helper). Confirmed via `/interview-me` — source of intent: [docs/intent/oblique-cabinetry-slider-linear.md](../intent/oblique-cabinetry-slider-linear.md).

**Done** — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md](../specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_LINEAR.md](../tasks/OBLIQUE_CABINETRY_SLIDER_LINEAR.md). Confirmed shipped on `main` (PR #433): `VoxelTrack`/`voxelTrackMath.ts` exist and `SliderLinear` renders through them exactly as described below, plus all 5 post-ship refinements the task doc's own "Post-ship refinements" section records (the extrusion-falloff/straddle-box redesign, the `skipMountAnimation` remount-flash fix, the hit-area/backing-layer change shared with 11.1.1, the trailing-reserve overflow fix, and the vertical-default infinite-loop fix) — all already on `main` as of this pass, not still pending.

### Create

- **Voxel-track rendering**: a row of uniform cabinet boxes replacing the traditional track+handle — 32×32px facades 8px apart (mobile), 40×40px at 10px apart (tablet), 48×48px at 12px apart (desktop). Box size and gap are fixed; **box count is not** — it's derived live from the slider's own container rather than authored per-schema or held to one flat constant app-wide.
- **Self-fitting box count**: a `ResizeObserver` on the slider's *parent* (never its own rendered element — self-observation would feed back into itself the moment the computed count changes the slider's own width, the same reasoning `useAutoSliderOrientation` already documents for orientation) fits as many fixed-size boxes as possible without overflowing, recomputed live on every resize. Composes with the existing `SliderOrientation` system rather than replacing it: `'horizontal'`/`'vertical'`/`'auto'` resolve exactly as they do today, and box-count-fitting then fills whatever length the *resolved* axis has — orientation answers "which way," this answers "how many." A container too narrow to fit even 3 boxes at the current breakpoint's size clamps to 3 and lets the row scroll/overflow, rather than shrinking boxes below their fixed size. **Post-implementation correction, 2026-09-09:** the fit originally left no room for the last (nearest-max) box's own pop-out bleed, so a container whose width happened to land on an exact multiple of `(boxSize + gap)` visibly overflowed at value 100% (found live — Limiter/Tempo/Automatic Effects) — a `computeVoxelTrackTrailingReserve(axis)` reserve is now subtracted before fitting and re-added when sizing `Slider.Root`. See `docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md § 1.13`. **Second post-implementation correction, same day:** the *vertical* case's own "live-measure the parent" fallback (used whenever `verticalHeight` is omitted, which is every real caller today) was genuinely circular for any parent whose height auto-sizes to its content — an infinite resize loop, found live for both `orientation: 'auto'` and explicit `orientation: 'vertical'` schemas. Fixed by defaulting to a fixed `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` (256px, restoring `docs/specs/VERTICAL_SLIDERS.md`'s own original non-measuring default) instead of falling through to live measurement. See `docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md § 1.14`.
- **Dual-fill value readout**: every box fully below the current value renders 100% `--color-accent` on its front face; every box fully above renders 100% inactive-color; the one box straddling the exact value is hard-split between the two at the local percentage within that box.
- **Extrusion-falloff**: the straddling box pops fully out (`popT: 1` against the same fixed `CABINET_POP_DISTANCE`/2:1 vector every Cabinetry item uses — not a box-height-scaled amount; 11.1.1 itself moved off height-scaling to a fixed distance before this item was specced, see `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.2`); boxes above it (toward the max, not yet filled) stay flat; boxes below it (toward the min, already filled) step down in equal decrements from the straddling box's 100% to 0% at the box nearest the minimum end, which does not extrude at all — the decrement scales with however many boxes currently sit below the straddling one, since that count is no longer fixed.
- **`SliderLinear` cabinet behavior**: the first consumer of the voxel-track system above, using the primitive's existing plain linear min/max mapping to place the straddling box and its local split percentage.

### Restructure

- `SliderLinear` (`src/components/ui/controls/`) re-renders internally through the voxel-track system — same `schema`/`value`/`onChange`/`disabled`/`verticalHeight` contract as today, including all 3 `SliderOrientation` values (`docs/COMPONENT_LIBRARY.md`).
- Same `timelineMap` registration and Strict Separation constraint as 11.1.1/11.1.2, extended to the per-box extrusion/fill transitions and the box-count refit — `onChange` still fires straight from Radix's `Slider.Root` drag/keyboard handling.

### About

The voxel-track mechanism built here is deliberately shared infrastructure, not `SliderLinear`-specific — 11.1.4 (`SliderLog`) and 11.1.5 (`SliderCenteredZero`) reuse it unchanged, swapping in only their own value-mapping math, so Volume, Detune, Gain, and every ADSR field still read as the same physical control family once all three ship. Because box count now self-fits to whatever container space a drawer's ordinary CSS gives a slider, this item fully resolves the "how many boxes fit in a given row" question — there's no separate later layout-rebuild phase left to decide it; a drawer's own row/grid sizing stays ordinary layout, untouched by this item. Same layout/WorldView/robot-visual/Sleeve exclusions as 11.1.1.

### Docs

- `docs/CONSOLE_THEMING.md` gains the voxel-track dual-fill/extrusion-falloff rules alongside 11.1.1's cabinet geometry notes.
- `docs/COMPONENT_LIBRARY.md` gains the "internal rendering changed, contract didn't" note for `SliderLinear`, plus a pointer to the shared voxel-track mechanism for 11.1.4/11.1.5 to reference rather than restate.

## 11.1.4 Oblique Cabinetry: SliderLog

Wires `SliderLog` into the voxel-track system 11.1.3 built. Depends on 11.1.3 having shipped. Confirmed via `/interview-me` — source of intent: [docs/intent/oblique-cabinetry-slider-log.md](../intent/oblique-cabinetry-slider-log.md).

**Done** — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md](../specs/OBLIQUE_CABINETRY_SLIDER_LOG.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_LOG.md](../tasks/OBLIQUE_CABINETRY_SLIDER_LOG.md). Scope ended up wider than this section's own original draft, resolved during the intent/spec passes rather than deferred: the interview surfaced a real architecture question the roadmap stub didn't address — `SliderLinear.tsx`'s inline `boxSize`/`gap`/`boxCount`/`trackLength`/`rootStyle` glue was extracted into a new shared hook, `useVoxelTrackSlider` (`src/components/ui/controls/`), and `SliderLinear.tsx` itself was retrofitted to call it, verified as a strictly behavior-preserving refactor (all 23 of its existing tests pass with a literal empty `git diff`) before `SliderLog` was allowed to depend on the same hook. `SliderLog`'s own box placement uses its normalized `t` (`sliderLogValueToT`'s output, the same value already fed to Radix's `Slider.Root`), not the raw log-scaled value against `schema.min`/`schema.max` — `voxelTrackMath.ts` assumes linear spacing, and only `t`-space is linear for a log curve. `verticalHeight` gained the identical fitting-budget semantics 11.1.3 already established for `SliderLinear`. `sliderLogMath.ts`'s own curve is untouched.

### Create

- **`SliderLog` cabinet behavior**: the same dual-fill/extrusion-falloff voxel-track rendering as `SliderLinear`, with the straddling box and local split percentage placed using the primitive's existing epsilon-floor log curve (`sliderLogMath.ts`, `docs/COMPONENT_LIBRARY.md`) instead of a plain linear mapping — no new value-mapping logic, just feeding the existing curve's output into 11.1.3's box-placement math.

### Restructure

- `SliderLog` (`src/components/ui/controls/`) re-renders internally through the voxel-track system — same `schema`/`value`/`onChange`/`disabled`/`verticalHeight` contract as today.

### About

Confirms the voxel-track mechanism generalizes across value-mapping curves with no new rendering logic, only a different `t → value` function feeding the same box-placement math — the intended shape of 11.1.3's split. Same layout/WorldView/robot-visual/Sleeve exclusions as prior items.

### Docs

- `docs/COMPONENT_LIBRARY.md` gains the "internal rendering changed, contract didn't" note for `SliderLog`.

## 11.1.5 Oblique Cabinetry: SliderCenteredZero

Wires `SliderCenteredZero` into the voxel-track system 11.1.3 built. Depends on 11.1.3 having shipped; not yet interviewed/specced. Unlike 11.1.4, this isn't a pure drop-in: `SliderCenteredZero`'s fill is zero-anchored, not min-anchored (`sliderCenteredZeroMath.ts` computes the zero point generally, not hardcoded to 50%), so 11.1.3's "below/above the current value" dual-fill rule needs to become "below/above the zero point, then further split by which side of zero the current value sits on" — the exact voxel-level adaptation is left open here, to be worked out during this item's own spec-driven-development pass rather than settled at roadmap level.

**Done** — see [docs/intent/oblique-cabinetry-slider-centered-zero.md](../intent/oblique-cabinetry-slider-centered-zero.md), [docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md](../specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md), and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md](../tasks/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md). The adaptation the roadmap left open above resolved to a fixed dead-center seam (`Math.floor(boxCount / 2)`, never the schema's own proportional zero point) rather than a proportional split — `voxelTrackMath.ts` gained a sibling function, `computeVoxelBoxStatesCenteredZero`, that reuses `computeVoxelBoxStates` per side (the negative side reversed) rather than a new independent formula. Box count is forced even (`computeEvenBoxCount`, floored at a new `VOXEL_TRACK_MIN_BOX_COUNT_EVEN` of `4`) via a small, additive `forceEven` option on `useVoxelTrackSlider`; extrusion-falloff is per-side via 2 new optional fields on `VoxelBoxState` that `VoxelTrack.tsx` prefers when present, falling back to its existing whole-row behavior otherwise. `sliderCenteredZeroMath.ts` (the pre-Cabinetry `computeFillRect`/`zeroPointPercent`/`valuePercent`) is deleted. This is the last of the 3 voxel-track sliders — `VoxelTrack.tsx`/`voxelTrackMath.ts`/`useVoxelTrackSlider` are now exercised by all 3 intended consumers (`SliderLinear`, `SliderLog`, `SliderCenteredZero`) and should be treated as stable, closed infrastructure going forward.

### Create

- **`SliderCenteredZero` cabinet behavior**: the voxel-track rendering adapted to a zero-anchored fill instead of a min-anchored one — the box(es) spanning from the zero point to the current value read as "filled" (100% `--color-accent`), the remainder as inactive, with the same hard-split-straddling-box and extrusion-falloff rules as 11.1.3 applied relative to that filled span rather than the track's min end.

### Restructure

- `SliderCenteredZero` (`src/components/ui/controls/`) re-renders internally through the voxel-track system — same `schema`/`value`/`onChange`/`disabled`/`verticalHeight` contract as today.

### About

The last of the 3 sliders and the one genuine adaptation of 11.1.3's mechanism, not just a swapped-in math function — worth flagging in review as the item most likely to surface an actual voxel-track design gap (e.g. what an all-zero or value-crosses-zero-mid-box state looks like) rather than a straightforward wiring pass. Same layout/WorldView/robot-visual/Sleeve exclusions as prior items.

### Docs

- `docs/COMPONENT_LIBRARY.md` gains the "internal rendering changed, contract didn't" note for `SliderCenteredZero`.
- `docs/CONSOLE_THEMING.md`'s voxel-track section (added by 11.1.3) gains the zero-anchored adaptation once this item resolves it.

## 11.1.5.1 Oblique Cabinetry: SliderLinear vertical box verification

Inserted out of sequence, not renumbering later phases (same pattern as 10.1–10.4 and 11.2). Real vertical `SliderLinear` consumers exist today (`robotOptionsConfig.ts`'s per-layer Gain/Phase/Interval sliders, all `orientation: 'vertical'`), but vertical voxel-track box sizing/layout has never been manually verified against one — `useVoxelTrackBoxCount.ts`'s own comment ("No real vertical `SliderLinear` consumer exists yet to verify a self-observing fix against, so this stays conservative") predates those config entries and was never revisited once they landed. Depends on 11.1.3 having shipped (it has); not yet interviewed/specced — the exact scope (what's actually broken, if anything, and whether "stays conservative" should change now that a real consumer exists to test against) is left open here.

**Done** — confirmed via `/interview-me`, 2026-09-10 (no separate intent/spec/tasks docs; a verification-pass finding, not a new feature). The manual check found one real bug: `CabinetBox`'s `left-face` wall (`src/components/ui/controls/CabinetBox.tsx`) hardcoded its height to the full `boxHeight` regardless of `frontHeight`, so a vertical straddle box's wall stayed full-size and, anchored to its own (correctly-sized, smaller) wrapper, visibly slid up/down as the dragged value changed `frontHeight` instead of shrinking in place. Fixed by sizing the wall to `frontHeight ?? boxHeight` directly — no live measurement needed, since `frontHeight` is already the caller's own known synchronous value. Because the fix lives in shared `CabinetBox`, it also resolved the identical bug for `SliderLog` (11.1.5.2) and `SliderCenteredZero` (11.1.5.3) in the same change — see those items. Verified live against `robotOptionsConfig.ts`'s per-layer Gain/Phase/Interval. `useVoxelTrackBoxCount.ts`'s vertical parent-observation conservatism was also checked against these real consumers and confirmed to already read correctly as shipped — no self-observation fix needed; its own stale "no real consumer yet" comment updated to reflect that. See `docs/CONSOLE_THEMING.md`'s "Voxel-track sliders" section for the full derivation.

### Create

- Nothing new by default — this is a verification pass first. A fix only if the manual check below actually finds one.

### Restructure

- Likely candidates, pending findings: `useVoxelTrackBoxCount.ts`'s vertical-measurement conservatism (parent-observation vs. self-observation, per its own comment above) revisited against a real consumer; `VoxelTrack.css`'s column-reverse box ordering/gap/sizing checked in the real running app (Robot Options drawer's Gain/Phase/Interval sliders), not just in jsdom.

### About

- Same category of gap 11.1.5's own `flipStraddleFill` bug surfaced for the horizontal axis — invisible to the automated test suite by construction (jsdom applies no real layout), findable only by eye. Vertical's `column-reverse` (min-at-bottom) is a genuinely different DOM-to-visual mapping than horizontal's `row` (min-at-left), so nothing about the horizontal fix guarantees the vertical axis is even self-consistent, let alone correct. Same layout/WorldView/robot-visual/Sleeve exclusions as prior items.

### Docs

- `docs/CONSOLE_THEMING.md`'s "Voxel-track sliders" section gains a vertical-specific note if anything is found/fixed.
- `useVoxelTrackBoxCount.ts`'s own "no real consumer yet" comment updated to reflect current config reality either way — it's stale today regardless of what this item finds.

## 11.1.5.2 Oblique Cabinetry: SliderLog vertical box verification

Same shape as 11.1.5.1, for `SliderLog`. Real vertical consumers: `audioRigConfig.ts`'s Low-Pass/High-Pass Filter Frequency and Resonance (Q) sliders, all `orientation: 'vertical'`. Depends on 11.1.4 having shipped (it has); not yet interviewed/specced.

**Done** — same shared `CabinetBox` `left-face` wall fix as 11.1.5.1 (found and fixed there in one pass; see that item and `docs/CONSOLE_THEMING.md`'s "Voxel-track sliders" section for the full writeup), verified separately here against `SliderLog`'s own real vertical consumers: `audioRigConfig.ts`'s Low-Pass/High-Pass Filter Frequency and Resonance (Q). No `SliderLog`-specific issues found — `sliderLogValueToT`'s own `t`-space box placement reads correctly on the vertical axis.

### Create

- Nothing new by default — verification first, fix only if the manual check finds one.

### Restructure

- Likely candidates, pending findings: the same `useVoxelTrackBoxCount.ts` vertical-measurement question as 11.1.5.1 (shared by both sliders via `useVoxelTrackSlider`); `SliderLog`'s own `t`-space box placement (`sliderLogValueToT`) checked specifically on the vertical axis, since every one of its own tests to date exercises the math in isolation from real vertical layout.

### About

- Same rationale as 11.1.5.1 — this is the second of the 3 sliders sharing the same underlying vertical-fitting code path (`useVoxelTrackSlider`/`useVoxelTrackBoxCount`), so a finding here may also apply to `SliderLinear` (11.1.5.1) and vice versa; each item still gets its own real consumer checked rather than assuming one slider's result covers the others. Same layout/WorldView/robot-visual/Sleeve exclusions as prior items.

### Docs

- `docs/CONSOLE_THEMING.md`'s "Voxel-track sliders" section gains a vertical-specific note if anything is found/fixed, consolidated with 11.1.5.1's own note rather than duplicated.

## 11.1.5.3 Oblique Cabinetry: SliderCenteredZero vertical box verification

Same shape as 11.1.5.1/11.1.5.2, for `SliderCenteredZero` — and the most consequential of the three to check. Real vertical consumers: `audioRigConfig.ts`'s EQ3 Low/Mid/High and `robotOptionsConfig.ts`'s per-layer Detune, all `orientation: 'vertical'`. Depends on 11.1.5 having shipped (it has); not yet interviewed/specced.

**Done** — same shared `CabinetBox` `left-face` wall fix as 11.1.5.1, verified against `SliderCenteredZero`'s real vertical consumers: `audioRigConfig.ts`'s EQ3 Low/Mid/High and `robotOptionsConfig.ts`'s per-layer Detune. `flipStraddleFill`'s CSS `order`-swap was specifically re-checked against a real vertical `column-reverse` render (the concern this item's own "About" section raised) and confirmed still correct — the negative side's filled piece lands on the seam side as intended, no correction needed. See `docs/CONSOLE_THEMING.md`'s "Zero-anchored dual-fill" section.

### Create

- Nothing new by default — verification first, fix only if the manual check finds one.

### Restructure

- Likely candidates, pending findings: the shared vertical-fitting question (11.1.5.1/.2); and specifically, `flipStraddleFill`'s own CSS `order`-swap fix (11.1.5's own post-ship bugfix) has only ever been verified via jsdom attribute assertions (`data-flip` presence, the `states` array's own correctness) — never against a real vertical `column-reverse` render. The horizontal fix's own correctness was independently re-derived by hand during code review; the vertical case has not been.

### About

- The most consequential of the 3 vertical-verification items: `SliderCenteredZero` is both the newest voxel-track slider and the one whose most recent change (the dead-center-seam split, plus the `flipStraddleFill` bugfix) was reasoned about and tested primarily in horizontal terms. Confirming the seam still lands correctly, per-side falloff still ramps the right direction, and the flip fix still puts the filled piece on the correct (now top/bottom, not left/right) side for a real vertical EQ3/Detune slider is this item's actual point — not a formality. Same layout/WorldView/robot-visual/Sleeve exclusions as prior items.

### Docs

- `docs/CONSOLE_THEMING.md`'s "Zero-anchored dual-fill" section (added by 11.1.5) gains a vertical-specific note if anything is found/fixed.
- `docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md` gains a short addendum if the `flipStraddleFill` mechanism needed any correction for the vertical axis.

## 11.1.6 Oblique Cabinetry: RadioButton

Wires `RadioButton` into the cabinet-box mechanism. Radix's `ToggleGroup` renders one segment per `schema.options` entry, which puts this item closer in shape to `Toggle` (11.1.2) than to `Button`'s single momentary box or the sliders' continuous voxel-track — each segment is itself a discrete on/off state (selected vs. not), just N of them instead of one. Depends on 11.1.1 having shipped (reuses its cabinet-box primitive and face-shading) and reuses 11.1.2's state-keyed (not click-keyed) pop precedent.

**Done** — see [docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md](../specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md), [docs/tasks/OBLIQUE_CABINETRY_RADIO_BUTTON.md](../tasks/OBLIQUE_CABINETRY_RADIO_BUTTON.md), and [docs/intent/oblique-cabinetry-radio-button.md](../intent/oblique-cabinetry-radio-button.md) (confirmed via `/interview-me`, 2026-09-10). Confirmed shipped on `main` (PR #438): `RadioButton.tsx` renders one `CabinetBox` per `ToggleGroup.Item`, popped state derived directly from `value` (not Radix's `data-state`), reusing `CabinetBox`/`cabinetGeometry.ts`/the sliders' own `useVoxelTrackGap` unmodified. One post-ship amendment, made directly by Crawford and already noted above in [10.5](#105-company-assignment-select--radiobutton): every option now also pops on `mouseEnter`/`mouseLeave`, matching `Button`'s own hover-pop feedback — reversing this item's original "no hover/partial-pop on unselected options" exclusion, applied app-wide (the primitive has no per-instance variant). See `docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md`'s own post-ship amendment note.

### Create

- **`RadioButton` cabinet behavior**: one `CabinetBox` per `ToggleGroup.Item` (one per `schema.options` entry), each keyed off whether it is the currently-selected value — popped for the selected option, flat for every other, generalizing 11.1.2's value-keyed (not momentary) pop from one box to N. Same fixed 2:1 vector, pop-proportional glow, and sharp front-face corners as every prior item, inherited from `CabinetBox` for free.
- **Row layout**: options render as a horizontal row of boxes, mirroring today's flat `ToggleGroup` row. Exact box sizing/spacing against option label content is left open here — `RadioButton` has no fixed box-count precedent the way the sliders' breakpoint-driven footprints do (`docs/reference/ROBOT_DATA_GRID.md`'s Audio Setting has 4 options, Layer Type and LFO Shape have their own counts) — to be settled during this item's own spec-driven-development pass.

### Restructure

- `RadioButton` (`src/components/ui/controls/`) re-renders internally through the cabinetry system — same `schema`/`value`/`onChange`/`disabled` contract as today. `disabled` continues to disable the whole `ToggleGroup.Root` at once (no per-item disabled), matching every other primitive's single `disabled` flag.
- Same `timelineMap` registration and Strict Separation constraint as every prior item — `onChange` still fires straight from Radix's `ToggleGroup.Root`, never the cabinet timeline. The existing deselect-to-empty guard (Radix's single-mode `ToggleGroup` emitting `''` when the active item is clicked again) is preserved unchanged.

### About

`RadioButton` is the fourth consumer of 11.1.1's foundation and the first with more than one box per control — closer in that respect to the voxel-track sliders (11.1.3) than to `Button`/`Toggle`, but discrete-option-keyed rather than continuous-value-keyed, so it reuses 11.1.2's "state, not click" pop rule per-box rather than 11.1.3's dual-fill/extrusion-falloff math — there's no "between two options" state to render, only "selected" or not. Unlike a slider, `RadioButton`'s box count isn't a free design choice self-fitted to available space (11.1.3) — it's fixed by `schema.options.length`, a domain value this item can't shrink or grow to fit a row. Whether a longer option set (still open — Audio Setting has 4, Layer Type and LFO Shape have their own counts) borrows 11.1.3's clamp-and-scroll fallback or needs its own answer is left to this item's own interview/spec pass, not yet numbered here. Same layout/WorldView/robot-visual/Sleeve exclusions as every prior item.

### Docs

- `docs/COMPONENT_LIBRARY.md` gains the "internal rendering changed, contract didn't" note for `RadioButton` once this item ships.

## 11.1.7 Oblique Cabinetry: AccordionContainer

Wires `AccordionContainer`'s trigger row into the cabinet-box mechanism — a single box wrapping the trigger's existing `+`/`−` indicator plus `DualLabel` content, popped when open and flat when closed, reusing 11.1.2's state-keyed pop rule (open/closed is exactly that shape: a persistent boolean, not a momentary click). The content panel's own existing GSAP height-tween expand/collapse is unchanged and out of scope — this item touches the trigger only. Depends on 11.1.1 having shipped.

**Done** — see [docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md](../specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md), [docs/tasks/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md](../tasks/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md), and [docs/intent/oblique-cabinetry-accordion-container.md](../intent/oblique-cabinetry-accordion-container.md). Confirmed shipped on `main` (PR #439): `AccordionContainer`'s trigger renders through `CabinetBox`, keyed off the same local `open` state the component already tracked (not `contentActive`), with the trigger's pop timeline and the content panel's existing height-tween timeline coexisting in `timelineMap` under distinct keys exactly as scoped.

### Create

- **`AccordionContainer` trigger cabinet behavior**: the trigger's existing `+`/`−` indicator and `DualLabel` content move inside a single `CabinetBox`, keyed off the same local `open` state `AccordionContainer` already tracks — **not** `contentActive`, the status-light concept already removed entirely from this component (`docs/COMPONENT_LIBRARY.md`'s `AccordionContainer` section). Popped is open, flat is closed. Same fixed 2:1 vector, glow, and sharp corners as every prior item.
- The box's width spans the full trigger row — content-sized like `Button`'s variable width (11.1.1), not a fixed square like `Toggle`'s (11.1.2) — so the indicator+label content still reads as one clickable row rather than shrinking to a small square.

### Restructure

- `AccordionContainer` (`src/components/ui/controls/`) re-renders its trigger internally through the cabinetry system — same `schema`/`children`/`defaultOpen` contract as today. `handleValueChange`/`animateTo` (the existing content-height GSAP timeline) are unchanged; the trigger's own pop is a second, independent `timelineMap` entry, not a replacement for the content-height one.
- Per CLAUDE.md's Strict Separation guardrail, the trigger's cabinet timeline only drives its own pop/glow — `Accordion.Root`'s `onValueChange` still fires the open-state change directly, same as today.

### About

The first item to attach cabinetry to a control that already carries its own independent GSAP timeline (content expand/collapse) — proves the two timelines can coexist in `timelineMap` under distinct keys without either fighting the other, a pattern later items may need again if any future control wants both a pop animation and its own separate content animation. Same layout/WorldView/robot-visual/Sleeve exclusions as every prior item; the content panel and its inner children are explicitly untouched.

### Docs

- `docs/COMPONENT_LIBRARY.md`'s `AccordionContainer` section gains the same "internal rendering changed, contract didn't" note, scoped explicitly to the trigger.

## 11.1.8 Oblique Cabinetry: Select — Cut

**Cut before any implementation began, not reverted for a bug**: `Select` itself was removed by
[10.5](#105-company-assignment-select--radiobutton) — a UI preference against dropdowns for its one
real use (robot→company assignment) — so there is no longer a trigger to wire into Cabinetry. The
original scope below (a single state-keyed `CabinetBox` around `RadixSelect.Trigger`'s content) was
never built; preserved for historical reference only, the same way `## 11`'s own original content is
kept below its cut line.

<details>
<summary>Original 11.1.8 content (Select trigger cabinetry, as scoped — historical reference only, never implemented)</summary>

Wires `Select`'s trigger into the cabinet-box mechanism — a single box wrapping the existing `RadixSelect.Trigger` content (`RadixSelect.Value` plus the `▾` icon), popped while open and flat when closed. The open floating options panel (`RadixSelect.Content`, rendered through a `Portal`) is unchanged and out of scope, the same way `AccordionContainer`'s content panel stayed out of scope in 11.1.7. Depends on 11.1.1 having shipped; not yet interviewed/specced.

### Create

- **`Select` trigger cabinet behavior**: `RadixSelect.Trigger`'s content renders inside a single `CabinetBox`, content-sized like `Button`'s variable-width box (not a fixed square), popped while open — reusing the state-keyed precedent 11.1.2/11.1.7 established, since `Select`'s open state is exactly as persistent as `Accordion`'s — and flat when closed. Same fixed 2:1 vector, glow, and sharp corners as every prior item.

### Restructure

- `Select` (`src/components/ui/controls/`) re-renders its trigger internally through the cabinetry system — same `schema`/`value`/`onChange`/`disabled` contract as today. `RadixSelect.Portal`/`Content`/`Viewport`/`Item` markup for the open options panel is untouched.
- Same `timelineMap` registration and Strict Separation constraint as every prior item — `onValueChange` still fires straight from `RadixSelect.Root`.

### About

The third state-keyed (not momentary-click-keyed) consumer, after `Toggle` (11.1.2) and `AccordionContainer`'s trigger (11.1.7), and the first whose popped state is driven by Radix's own internal open/closed rather than a value this app's own state holds — confirms the mechanism doesn't care which side owns the boolean it reads. The options panel itself stays flat, unstyled markup, matching how `AccordionContainer`'s content panel stayed out of scope in 11.1.7 — Cabinetry styles triggers/controls, not floating or expanding content areas, a rule this item makes explicit for the first time rather than a new one. Same layout/WorldView/robot-visual/Sleeve exclusions as every prior item.

### Docs

- `docs/COMPONENT_LIBRARY.md` gains the "internal rendering changed, contract didn't" note for `Select`, plus the "Cabinetry styles triggers, not floating content" rule for future items to reference rather than restate.

</details>

## 11.1.9 Oblique Cabinetry: TextInput / CoordsInput

Wires `TextInput` into the cabinet-box mechanism. **Settled directly by Crawford, confirmed via `/interview-me`
(2026-09-10), not left to this item's own spec pass**: the `<input>` itself keeps acting exactly like a plain
input always has — typing, focus, caret, text selection, and `disabled` styling all completely untouched, no
new hover/focus/content-keyed pop or any other state-keyed pop added on top, and the box itself never reacts
to `disabled` either (always popped, purely decorative). `TextInput` gets [`DirectionalPanel`](specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md)'s
own *facade boundary* (a single permanently-popped, non-animating `CabinetBox` wrapping `DualLabel` + the
field together, label inside the box) but explicitly **not** its nesting-context mechanism — every `TextInput`
instance always renders its own facade unconditionally, with zero awareness of what composes it. Source of
intent: [docs/intent/oblique-cabinetry-text-input.md](../intent/oblique-cabinetry-text-input.md). Depends on
11.1.1 and `DirectionalPanel`'s own Cabinetry treatment (shipped) having landed; not yet interviewed/specced
beyond this constraint.

### Create

- **`TextInput` cabinet behavior**: a single `CabinetBox` facade wraps `DualLabel` + the `<input>` together,
  `popped` a literal `true` (never a variable) plus `skipMountAnimation` — reusing `DirectionalPanel`'s own
  facade boundary (`docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md` §1), not `AccordionContainer`'s
  two-box split (11.1.7) or any prior state-keyed precedent. Unconditional and self-contained — no
  `DirectionalPanelNestingContext`-style mechanism, no per-instance opt-out; every real and future `TextInput`
  consumer (Company name, Sector Settings AS name, `CoordsInput`'s two fields, an eventual robot-detail name
  field) gets exactly the same single facade with no special-casing. The box must not obscure the native
  `<input>`'s own text/caret — `CabinetBox`'s existing `pointer-events: none` overlay convention (11.1.1)
  already guarantees this structurally, the same caret-cursor concern already resolved once for `Toggle`'s
  own empty box (`docs/specs/OBLIQUE_CABINETRY_TOGGLE.md`) — this item's own eventual spec pass should still
  confirm it explicitly for a real text-entry element, not assume the precedent transfers automatically.
- **`CoordsInput` needs no Create item of its own and no special-casing** — confirmed directly: it composes
  two `TextInput` instances with no rendering of its own beyond its own wrapping `DualLabel` and field row,
  and each inner `TextInput` renders its own facade exactly as it would standalone. The natural result is two
  independent popped boxes side by side (X, then Y) — a side effect of `CoordsInput`'s existing composition,
  not a deliberate design choice about `CoordsInput` specifically. Explicitly **not** `DirectionalPanel`'s
  "only the top-level instance gets a facade" pattern, even though the underlying nesting shape (one
  `ControlSchema`-driven component composing another) looks structurally similar.

### Restructure

- `TextInput` (`src/components/ui/controls/`) re-renders internally through the cabinetry system — same
  `schema`/`value`/`onChange`/`numeric`/`disabled` contract as today. `CoordsInput`'s own X/Y
  `TextInputSchema` construction and rounding/blank-guard logic are unchanged, and its own `.tsx` needs no
  edit at all — its two-box appearance falls out of `TextInput`'s own change with zero call-site changes.
- The facade never actually animates (literal `popped={true}` + `skipMountAnimation`) and never reads
  `disabled` — so, matching `AccordionContainer`'s own static facade instance and `DirectionalPanel`'s own
  facade, no real `timelineMap` tween is ever registered for it; the box still needs a `timelineKey` prop
  (required), used only for the harmless unmount `killTimeline` call.
- Same Strict Separation constraint as every prior item, though there's nothing left to separate here beyond
  the native `<input>`'s own existing `onChange` — no GSAP-driven state ever reaches it.

### About

The last of the 14 primitives to receive Cabinetry — `Stepper`/`StepperWithToggle` were already dropped (see
11.1.1), `Select` was cut entirely (see 11.1.8, above) rather than dropped from Cabinetry specifically, and
`DualLabel` is pure layout/display with no interactive hit box of its own and was never in scope. Previously
flagged, like 11.1.5 was, as the item most likely to surface a genuine design gap, since free text is the one
control shape in the entire inventory with no natural "popped" state precedent among 11.1.1–11.1.7's
click/value/open-keyed options — resolved by sidestepping that gap entirely rather than filling it: no new
pop-trigger mechanism, just `DirectionalPanel`'s existing static-facade *look*. Deliberately simpler than
`DirectionalPanel` itself, though: no nesting-context, because `TextInput` — unlike `DirectionalPanel`, which
is designed to nest arbitrarily deep — has no actual "box inside a box" problem to solve, only ever composed
by a handful of fixed call sites (`CoordsInput` today) that don't themselves need Cabinetry awareness. Same
layout/WorldView/robot-visual/Sleeve exclusions as every prior item.

### Docs

- `docs/COMPONENT_LIBRARY.md` gains the "internal rendering changed, contract didn't" note for `TextInput`
  once this item ships, describing the static per-instance facade (no pop-trigger rule to document, since
  there isn't one) and explicitly noting `CoordsInput` needed no code change of its own.

**Done** — see [docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md](../specs/OBLIQUE_CABINETRY_TEXT_INPUT.md), [docs/tasks/OBLIQUE_CABINETRY_TEXT_INPUT.md](../tasks/OBLIQUE_CABINETRY_TEXT_INPUT.md), and [docs/intent/oblique-cabinetry-text-input.md](../intent/oblique-cabinetry-text-input.md). Confirmed shipped on `main` (`599ea19`): `TextInput.tsx` renders through a permanently-popped, `autoHeight` `CabinetBox` facade exactly as scoped (`popped` a literal `true`, `skipMountAnimation`, `DualLabel` + field wrapped together), with no code change needed in `CoordsInput.tsx` itself. This item shipped without ever getting its closing stamp here — found and corrected during a 2026-09-27 archive-readiness pass over `docs/intent`/`docs/specs`/`docs/tasks`.

## 12. Font Sizes: App-Wide Type Scale

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. High priority. Today's entire type scale is 3 raw tokens — `--font-size-sm: 12px`, `--font-size-md: 16px`, `--font-size-lg: 20px` (`src/index.css:9-11`) — applied ad hoc across components with no documented scale or usage rules. This phase establishes a real type-scale system (more steps, semantic naming/usage guidance, applied consistently app-wide), not just adjusting the existing 3 tokens. Not yet interviewed/specced. Possibly related to 13 below — Crawford suspects label font sizing is the (unconfirmed) root cause of that bug, hence the ordering: land this first and check whether it resolves 13 before scoping a separate fix.

**Done** — see [docs/intent/type-scale.md](../intent/type-scale.md), [docs/specs/TYPE_SCALE.md](../specs/TYPE_SCALE.md), and [docs/tasks/TYPE_SCALE.md](../tasks/TYPE_SCALE.md). Implemented on `feature/type-scale`, merged to `main` via PR #457 (`4f95367`). 7 semantic size tokens + 4 weight tokens + a new `--font-controls` family token (Titillium Web, a new `@fontsource` dependency) replace the old 3-token scale everywhere; the old tokens are fully removed, not left as dead fallbacks. A real bug was found and fixed mid-implementation (not anticipated by the spec): `container-type: inline-size`, added to give leaf controls a compact-label container-query fallback, collapses any shrink-to-fit-sized element to zero width — this broke every `Button` and every vertical-orientation slider in a real browser (user-reported) until fixed by scoping the container declaration off `Button` entirely and onto the sliders' horizontal variant only. **Net effect on 13 below: vertical sliders now have NO compact-fallback mechanism at all** (not "unresolved," genuinely removed) — this phase does not resolve 13, and a real fix there will most likely need a markup change (a wrapper-element split), not a CSS-only one. Scope this accordingly rather than assuming 12 already covers it.

## 13. Bug: Vertical Slider Label Overflow

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. High priority — a real shipped-behavior bug, not polish debt ("we can't ship this issue"). Some (not all) vertical sliders overflow their bounds; suspected but unconfirmed to be related to label font size. Notably, 11.1.5.1–11.1.5.3 already ran a manual verification pass on vertical `SliderLinear`/`SliderLog`/`SliderCenteredZero` against their real consumers and found only one bug (the `CabinetBox` wall-height fix, already shipped) — so this is either a regression since then or a case those passes didn't cover. Depends on 12 (Font Sizes) landing first.

**Done** — confirmed shipped on `main`. Root cause, found live via DevTools, was unrelated to label font size (12 did not resolve this): the vertical box-track wrapper's `overflow-y: auto` was meant only for the rare 3-box overflow floor, but a native scrollbar renders its full chrome the instant `scrollHeight` exceeds `clientHeight` by even 1px — the Audio Rig's Filter Frequency/Resonance sliders hit exactly that as a sub-pixel rounding artifact, not a real too-tall-for-its-container problem. Fixed by switching `overflow-y` from `auto` to `hidden` on all three vertical slider variants (correct either way, since the element is `aria-hidden="true"`). Also landed from the same investigation: `SliderLinearSchema`/`SliderLogSchema`/`SliderCenteredZeroSchema` gained an optional `verticalHeight` field so a vertical slider's box-fitting budget is declared in config instead of silently defaulting, set on all 10 real vertical schemas in `audioRigConfig.ts`/`robotOptionsConfig.ts`. Regression coverage: `verticalSliderOverflow.test.ts` pins `overflow-y: hidden` on all three variants; `audioRigConfig.test.ts`/`robotOptionsConfig.test.ts` guard that every real vertical schema declares its own `verticalHeight`.

## 14. Visual Identity: Color Scheme & Trait-Based Theming

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. High priority — "can't ship with what we've got." Crawford has a custom color scheme to bring over, replacing the current hand-picked static "Ballast" palette (`src/index.css`); colors stay static, not seed-driven, consistent with `docs/CONSOLE_THEMING.md`'s decision to cut seed-driven theming over its unresolved WCAG-safety-vs-visual-variety tension. Beyond the base palette swap, also exploring trait-based theming for Audio Rig controls — grouping parameters by shared trait rather than one flat palette, e.g. time-based params (Reverb, Delay, ADSR) sharing one color family, output params (Compressor, Limiter, Volumes) sharing another.

**Done** — see [docs/intent/color-scheme-trait-theming.md](../intent/color-scheme-trait-theming.md), [docs/specs/COLOR_SCHEME_TRAIT_THEMING.md](../specs/COLOR_SCHEME_TRAIT_THEMING.md), and [docs/tasks/COLOR_SCHEME_TRAIT_THEMING.md](../tasks/COLOR_SCHEME_TRAIT_THEMING.md). Confirmed shipped on `main`: `src/index.css`'s `--color-accent-a`/`-b`/`--color-accent`/`--color-accent-gradient` are the new trait-scoped token set (replacing the flat "Ballast" accent), and `src/utils/traitColors.ts`'s `getTraitColorStyle`/`getRobotColorStyle` re-scope every consumer for a subtree via ordinary CSS cascade. `--color-bg`/`--color-surface`/`--color-border`/text tokens remain the unchanged static Ballast base.

## 15.1 Component: SliderLinear Read-Only Mode

Split out of the original item 15 (Redesign: Robot Cards, requested by Crawford via `docs/todo/temp.md`, 2026-09-11) into 15.1–15.3 on 2026-09-13, once Crawford's written notes for that redesign made clear both the robot-card and robot-detail redesigns want to display Battery/Power as a read-only `SliderLinear` rather than bespoke markup — a primitive-level prerequisite for 15.3 below, with no dependency of its own. High priority.

Adds an optional `readOnly` prop to `SliderLinear` (`src/components/ui/controls/SliderLinear.tsx`): when set, the slider shows the bound value (via the existing `VoxelTrack` fill) but accepts no pointer/keyboard interaction. Open questions going in: whether this reuses Radix `Slider`'s own `disabled` wiring under the hood or is a distinct code path, and what ARIA treatment is correct (`aria-readonly` reads more accurately than `aria-disabled` for "an accurate live value you can't edit," but `disabled` is the only non-interactive state the primitive has today).

**Done** — see [docs/specs/SLIDER_LINEAR_READ_ONLY.md](../specs/SLIDER_LINEAR_READ_ONLY.md). Confirmed shipped on `main`: resolved as a distinct code path, not `disabled` reuse — `readOnly` renders the bound value through `VoxelTrack`'s existing fill under `role="status"`, with no `Slider.Root`/`Thumb` mounted at all, rather than a disabled-but-present Radix slider. `docs/COMPONENT_LIBRARY.md`'s `SliderLinear` contract entry updated to match.

## 15.2 Redesign: Robot Cards

The list-card half of the original item 15 (requested by Crawford, `docs/todo/temp.md`, 2026-09-11); scope refined 2026-09-13 from Crawford's own written notes. `RobotSelectionCard.tsx`, rendered in `RobotsTab.tsx`'s list — a visual/UX redesign of the existing shipped design. Depends conceptually on 14 (Color Scheme) landing first so the redesign works from the real palette instead of being redone.

Per Crawford's notes: the card splits into a linked top half (activates `selectRobot`, same as today) and an unlinked bottom half holding only the company-assignment `RadioButton`. The top half is one meta-data row broken into two columns — the day/night-invariant avatar on the left, and on the right, three unlabeled rows (no `DualLabel` lore/human pair, just the raw value): Robot Name, Job, and a combined Docking/Status line, where Status reads "Emitting" or "Disabled." The existing standalone Battery-% row and `AudioStatusBadge` dot are both dropped from this card entirely (Battery moves to the redesigned detail card, 15.3; a battery-driven avatar dim already exists independently via `computeBatteryDimOpacity` and is unaffected).

"Emitting"/"Disabled" is true audibility, not just this robot's own `audioMode` — confirmed with Crawford 2026-09-13: a robot reads "Disabled" when its own `audioMode` is `mute`, OR when any other robot in the same locale is `solo` and this one isn't. That mute/solo predicate exists today only inlined in `AudioEngine.ts`'s `triggerWithCap` (lines ~312-323) — this phase must extract it into one shared, exported function both the engine and this new UI status call, rather than re-deriving the same rule a second time (same class of issue as the open `docs/DUPLICATE_VALUE_AUDIT.md` items).

**Done** — see [docs/specs/ROBOT_CARDS_REDESIGN.md](../specs/ROBOT_CARDS_REDESIGN.md) and [docs/intent/robot-cards-redesign.md](../intent/robot-cards-redesign.md). Confirmed shipped on `main`: `RobotSelectionCard.tsx` splits into `.robot-selection-card__top` (clickable — avatar, Name/Job, and the combined Docking · Status line) and `.robot-selection-card__bottom` (company-assignment `RadioButton` only, a plain sibling with no nested-interactive-element bubbling concern). `isRobotAudible` (`src/utils/robotAudibility.ts`) was extracted and is now the single shared predicate consumed by both this card and `AudioEngine.ts`'s `triggerWithCap`, resolving the duplication this item's own scope flagged. **Scope note**: the bullet above says the standalone Battery row is "dropped from this card entirely" — as shipped, Battery instead renders via the new read-only `SliderLinear` (15.1) inside the top region alongside Name/Job/Status, rather than moving exclusively to 15.3's detail card. Left as originally drafted above for the historical record; this note reflects what actually shipped.

## 16. Redesign: Company CRUD Area

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. High priority. `CompanyManager.tsx` (Phase 10) — visual/UX redesign of the existing company create/rename/delete + bulk-edit panel. Same color-scheme dependency as 15.1–15.3.

**Done** — design changed per Crawford, 2026-09-16: rather than the fuller ground-up visual/UX redesign originally scoped above, the narrower [Company Section Enhancements](../specs/COMPANY_SECTION_ENHANCEMENTS.md) spec (confirmed via `/interview-me`, 2026-09-13 — the CRUD accordion wrap, per-company identity color, per-option `RadioButton` color, and selection-driven robot-list sort) plus its own follow-on [Company CRUD Button Preview](../specs/COMPANY_CRUD_BUTTON_PREVIEW.md) (dynamic Create/Rename/Delete labels) and [10.5](#105-company-assignment-select--radiobutton)'s `Select`→`RadioButton` swap were judged sufficient on their own — confirmed shipped on `main` (PRs #463, #466, and others). No separate ground-up visual/UX pass was ever built or is planned; this item is closed against that decision rather than left open waiting for one.

**Update, 2026-09-27:** `CompanyManager.tsx`/`CompanyButtonRow.tsx` — the components this item was originally scoped against — no longer exist. The Navigation & Layout Rewrite (Phase 22) deleted both outright rather than migrating them; company CRUD now lives under the nav tree's Companies branch (`CompanyCrudControls.tsx` survives and renders there, alongside `CompaniesContent.tsx`). This phase's own "Done" verdict still stands — nothing here needs redoing — the file-path context above is just historical.

## 15.3 Redesign: Robot Detail Top Card

The detail-page half of the original item 15 (requested by Crawford, `docs/todo/temp.md`, 2026-09-11; was numbered 17 before the 2026-09-13 split) — scope refined 2026-09-13 from Crawford's own written notes. `RobotDisplaySection.tsx` — the avatar/meta-data card at the top of the Robot Options screen. Same color-scheme dependency as 15.2/16, plus depends on 15.1 (the new `SliderLinear` `readOnly` mode) for its Power readout.

Per Crawford's notes: a circular layout around the central, day/night-invariant avatar SVG — Name at top-left, Job at top-right, Docking status at bottom-left, and the same "Emitting"/"Disabled" Status (15.2's shared audibility predicate) at bottom-right, all unlabeled values as in 15.2. Beneath the circle, the new read-only `SliderLinear` (15.1) displays Battery level labeled "Power." Beneath that, the company-assignment `RadioButton` as its own section labeled "Company."

**Done** — see [docs/intent/robot-detail-top-card-redesign.md](../intent/robot-detail-top-card-redesign.md), [docs/specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md](../specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md), and [docs/tasks/ROBOT_DETAIL_TOP_CARD_REDESIGN.md](../tasks/ROBOT_DETAIL_TOP_CARD_REDESIGN.md). Confirmed shipped on `feature/detail-top-redesign`, manually verified in-browser: `RobotDisplaySection.tsx` renders a centered-avatar 3-column/2-row grid (Name/Job row 1, Docking/Status row 2) — a loose grid framing, not a literal circle (confirmed via `/interview-me`). Three corrections to this draft, all confirmed during that interview: every field **keeps** its `DualLabel` lore/human caption (not unlabeled like 15.2); Battery stays labeled "Battery Data," matching 15.2, not relabeled "Power"; and Company needed no new wrapping section at all — `RadioButton` already composes its own "Company" `DualLabel` internally, a scope correction found during the spec pass (`SliderLinear` does the same for Battery). Status is wired to the same shared `isRobotAudible` predicate 15.2 uses.

## 17.1 Styling Overhaul: Sleeve / Tablet-Off State

Requested by Crawford, 2026-09-16. High priority. First of a 5-part, per-view styling overhaul of the entire app (17.1–17.5), split by the app's own top-level view boundaries so each ships and reviews independently rather than as one large undifferentiated pass — precedes [18](../roadmap.md#18-cabinetry-verification-accessibility--performance) (Cabinetry Verification), which should run once this series lands rather than before it, the same "verify after the visual-touching phases" ordering 18 already applies to 12/14/15.x/16. Scope: `SleeveContainer` and the tablet-off/powered-down visual state (`PowerRockerSwitch`, the Sleeve's own casing chrome) — deliberately out of scope for every prior Cabinetry/Color-Scheme phase (11.1.1's own About section: "the power rocker switch and the rest of the Sleeve casing — out of scope for now").

**Done, 2026-09-27 — confirmed by Crawford.** Styled directly, without a separate `/interview-me`/spec pass (same convention as [24](#24-nav-panel-underline-link--deepest-level-auto-expand--superseded)/[29](#29-nav-panel-home-button-welcome-text-breadcrumb) below). No dedicated spec/task/intent doc exists for this item; the relevant commit history is `SleeveContainer.css`/`PowerRockerSwitch.css` work on `main` (`1caa931` "fixing power rocker css vars, moving rocker to the right", `422cc0e` "lots of tweaks re: nav display ui", and earlier `3d37d8a` "sleeve and logo updates").

## 17.2 Styling Overhaul: Console Hub (No View Selected)

Requested by Crawford, 2026-09-16. High priority — second of the 17.1–17.5 series (see 17.1). Scope as originally drafted: the hub grid/nav state (`Console.tsx`/`ConsolePanel.tsx`, `HubNav`) before any tile is selected.

**Done, 2026-09-27 — confirmed by Crawford, but superseded rather than built as scoped above.** `Console.tsx`/`ConsolePanel.tsx`/`HubNav` no longer exist — Phase 22's Navigation & Layout Rewrite replaced that entire model with `NavPanel`/`ContentPane`. The underlying goal (something considered, not a blank screen, before any view is selected) is satisfied by `ece1a2e` ("Move Close to a 'Home' button in NavPanel; add welcome Textbox to blank state", part of [29](#29-nav-panel-home-button-welcome-text-breadcrumb)'s own work): `ContentPane.tsx`'s blank state (`activeHubTile === null`) now renders the `Textbox` primitive with welcome copy — its first real consumer — sized to its own content and anchored clear of `WorldView`/`NavPanel` rather than full-bleed, so `Robot.tsx`'s click-to-select handler still reaches `WorldView` at this state.

## 17.2.1 Performance: View-Switch Profiling Harness & Baseline

Requested by Crawford, 2026-09-18, after the first GitHub Pages deploy (`https://fallboard-studios.github.io/trace-atlas/`) turned out noticeably slower on a phone than on desktop, with audio audibly pausing while a Console view (Fleet Params / Probes / Nav & Comms) changes — also seen, less often, on Crawford's laptop. High priority — first of the 17.2.1–17.2.5 series, inserted under 17.2 (the Console view-switch surface) as out-of-sequence performance work ahead of the rest of the 17.x styling passes; every item below is verified against this one's numbers rather than by feel. Not yet specced.

**Findings that opened the series** (2026-09-18, all measured, not estimated): a headless-Chrome run against the production build at Chrome's own 4× CPU-slowdown setting reproduced Crawford's DevTools Local-metrics screenshot (INP 43,184 ms; a click on a `.sc-cabinet-box__front` spending 25.5 s in processing, and a following accordion click waiting 42.8 s of input delay behind it). Long tasks per tile switch, 4× throttled: Fleet Params 1.7 s + 2.0 s, Probes 5.7 s + 2.6 s, back to Fleet Params 1.8 s + 1.5 s. The same script **unthrottled** on a fast desktop still produced tasks of 192 ms (open Fleet Params), 373 ms (switch to Probes), and 206 ms (back to Fleet Params) — every one over Tone's default 100 ms lookahead (see 17.2.4), which is the audible pause. Nav & Comms (26 cabinet boxes on the page) produced none over 55 ms. On-page `.sc-cabinet-box` counts: 12 with no tile open (the header's own), 321 with Fleet Params, 481 with Probes.

### Create

- A repeatable profiling script committed to the repo (e.g. `scripts/perf/`), replacing the throwaway scratch versions used above. Drives an installed Chrome over the DevTools Protocol using Node's built-in `WebSocket` (Node 24) — no new dependency, per `CLAUDE.md`'s boundary. Powers the app on, applies a configurable CPU-throttle rate (default 4×) and optional mobile viewport, clicks each header nav tile in turn, and reports per-step long tasks (`PerformanceObserver` `longtask`), on-page cabinet-box count, and optionally a CPU profile plus a layout/paint trace summary. Runs against `vite preview` of a production build; a `--minify false` build is needed when function names matter.
- A baseline table (the 2026-09-18 numbers above, plus the same run on a real phone if Crawford can supply one) recorded in the doc named below, so 17.2.2–17.2.5 each report a before/after against it.

### About

Measurement caveats to keep with the harness: `Emulation.setCPUThrottlingRate` slows the main thread only, not compositor/raster worker threads; headless Chrome's software-vs-GPU raster behavior differs from a phone's, so paint/composite numbers (17.2.5) are directional until confirmed on real hardware; and Web Audio's own render thread is not what stalls here — the main-thread tasks starve Tone's scheduler, not the audio callback itself.

### Docs

- A short `docs/PERFORMANCE.md` (new) recording the method, the caveats above, and the running baseline table. Add to `CLAUDE.md`'s reference doc list.

**Done** — implemented on `bug/view-change-slowdown`, merged to `main` via PR #484 (`dded768`), 2026-09-18. `scripts/perf/profile.mjs` (`npm run perf`) is the committed harness, verified end to end against production and unminified builds at 1× and 4× throttle; `docs/PERFORMANCE.md` holds the method, caveats, and the 2026-09-18 baseline table, and is listed in `CLAUDE.md`. `eslint.config.js` gained a Node-globals block for `scripts/**/*.mjs`. Two deviations from the draft above: the **real-phone baseline is not built in** — the harness drives desktop headless Chrome only, and a phone measurement stays a documented manual step (DevTools → Remote devices over USB) — and run-to-run variance turned out large enough (Probes at 4×: 2.3 s vs 3.9 s across two runs) that the baseline is recorded as ranges over multiple runs, not single numbers. A harness bug caught during verification: `--profile`/`--trace` originally re-used one window action, so the trace of "open Fleet Params" measured a *close*; each capture now resets to the blank hub first.

## 17.2.2 Performance: Lazy-Mount Collapsed Accordion Content

Requested by Crawford, 2026-09-18 — second of the 17.2.1–17.2.5 series (see 17.2.1). High priority. Not yet specced. `AccordionContainer.tsx` renders its content with Radix's `forceMount` (`src/components/ui/controls/AccordionContainer.tsx`, the `<Accordion.Content ... forceMount>` at ~line 195), so every collapsed section's controls are built and their per-box GSAP setup runs anyway — the direct reason opening Fleet Params puts 321 cabinet boxes on the page and Probes 481, when only a fraction of those sit in a section that's actually open.

### Restructure

- `AccordionContainer` mounts its children only once the section has been opened at least once (or `defaultOpen`), and keeps them mounted afterward so re-collapsing doesn't replay the mount work or lose control state. Open questions for the spec: whether content should unmount again on collapse (frees memory, replays mount cost on each open) versus staying mounted after first open, and how the existing height/overflow timeline (`accordionAnimation.ts`) measures a section whose content wasn't there until the open — it currently reads the content's real height.
- Every existing consumer's own tests keep passing; new tests pin that a never-opened section renders no controls (a count assertion on `.sc-cabinet-box`), and that opening it renders them once.

### About

No animation- or audio-architecture change — this reduces how much work the existing GSAP setup does, not how it works. Expected to be the largest single win on first tile open, since it cuts the box count directly; verify against 17.2.1's baseline before deciding how far 17.2.3 needs to go.

### Docs

- `docs/COMPONENT_LIBRARY.md`'s `AccordionContainer` entry updated to state the mount-on-first-open contract.

**Done** — see [docs/specs/ACCORDION_LAZY_MOUNT.md](../specs/ACCORDION_LAZY_MOUNT.md) and [docs/tasks/ACCORDION_LAZY_MOUNT.md](../tasks/ACCORDION_LAZY_MOUNT.md). Implemented on `bug/view-change-slowdown`, merged to `main` via PR #484 (`dded768`), 2026-09-18; **Crawford's own visual look at the open animation on a real device is still outstanding** (I can measure frames, not feel). `AccordionContainer` builds a section's controls on first open and keeps them mounted; all seven spec §5.3 gates pass on the final build, measured with the 17.2.1 harness (3 sequential runs each, [docs/PERFORMANCE.md](../PERFORMANCE.md)): boxes in closed accordions **0** everywhere; total cabinet boxes Fleet Params **321 → 20**, Probes list **~490 → 137**, robot detail **~403 → 45**; at 1× no task ≥ 100 ms when opening Fleet Params or robot detail (was 262 / 291 ms) and the Probes list's longest task **410 → 178 ms** (ceiling 205); at 4× total time in ≥ 100 ms tasks **−89% / −84%** for Fleet Params / robot detail (2,659 → 298 ms, 2,854 → 453 ms). Total work is conserved, not eliminated: it moved from every tile open to the first open of each section — EQ & Filters (~132 boxes) and Source (~232) still cost ~150–200 ms at 1× and ~1.1–1.3 s at 4× on that first open, recorded not gated (§7 Q5). Deviations from the draft above:

- **The animation needed real work, beyond the draft.** The plain lazy mount made the two heaviest sections open in 3 tween frames instead of ~12 (the mount ate the tween's clock; deferring the start by one tick made Source worse). It now waits on GSAP's own ticks for the section's height to settle before animating (capped), and tweens to the inner wrapper's laid-out height instead of `scrollHeight`, which also removed a 2–2.5 px snap at the end of *every* open that predates this work. Result: 9–15 tween frames for the heavy sections at 1× (pre-change 12), height snap 0–0.5 px, and **zero open-but-empty frames** at every width and throttle. Crawford opened animation timing for adjustment (spec §3); no duration or easing was changed — only *when* the tween is built and what height it targets.
- **One measured residual, not fixed:** at 820 px wide, opening EQ & Filters grows ~15 px about 120 ms *after* the open completes in ~36% of runs (4 of 11; **0 of 5 on the pre-change build**, so lazy mounting causes it). Not root-caused; recorded in `docs/PERFORMANCE.md` for 17.2.3 to look for.
- **The harness grew** beyond 17.2.1's scope to measure this: per-section first-open rows, robot-detail steps, a `boxes in closed accordions` column, and `--smoothness`/`--width` frame sampling (its first two versions had bugs — a sampler that leaked stale frame loops between toggles, and a snap metric that reported the tween finishing between two slow frames as a 2,032 px "jump" at 4× — both found by looking at raw frames and fixed).
- **A spec claim was wrong and corrected:** Radix sets `aria-controls` on the trigger only while the section is open, so a never-opened section has none (the draft said it "stays valid").
- **Test churn was as predicted, mechanical, and safe:** ~160 `render(` calls across six test files now go through a file-local `renderOpen()` and the shared `openAllAccordions()` helper (`src/testUtils/openAccordions.ts`); no `expect` line changed and no test was removed; one test that asserts a section stays *closed* keeps plain `render()`. An `AudioRigDrawer` guard fails if an eager mount is ever re-added.
- **Three pre-existing flaky tests surfaced** (not caused by this work — the same full-suite failures reproduce on the commit before any of it): `audioSwells.test.ts`, `CompanyCrudControls.test.tsx`, and `factoryPlacementSystem.test.ts` each fail intermittently under a full parallel run and pass in isolation. Logged in `docs/todo/backlog.md` item 29.

## 17.2.3 Performance: CabinetBox Mount-Time Layout Thrash

Requested by Crawford, 2026-09-18 — third of the 17.2.1–17.2.5 series (see 17.2.1). High priority. Not yet specced. **Needs Crawford's sign-off before implementation** — `CLAUDE.md` requires asking before changing the animation architecture, and this touches how `CabinetBox` sets up its GSAP state.

Root cause, from the 2026-09-18 CPU profile and layout trace: opening Fleet Params produced ~10,200 forced style-and-layout passes (Chrome's `Document::UpdateStyleAndLayout`, ~2.9 s of a 9 s window at 4×), with GSAP's `_getComputedProperty` (a `getComputedStyle` read) as the top JavaScript self-time function. Each `CabinetBoxInner` runs the one-time wall-skew `gsap.set()` pair on mount and, for `skipMountAnimation` boxes (every `VoxelTrack` box), three more `gsap.set()` calls plus the `--cabinet-glow` write. GSAP reads the element's current computed transform before each first set; that read forces a full layout because the previous box's writes already invalidated it — repeated across hundreds of sibling boxes committed in one React pass.

### Restructure

- Stop reading computed style on the mount path: render each box's initial wall skew, wall scale, and front-face offset as inline styles (or CSS variables) derived from `poppedT`/pop distance, and reserve GSAP for actual pop transitions. The existing 2026-09-17 comment in `CabinetBox.tsx` (GSAP cannot round-trip a pure `skewY` through its transform cache, hence the outer/inner left-wall split) must be honored — the fix cannot reintroduce that decomposition bug; the spec should say how an inline-authored initial transform hands off to the first tween without GSAP re-deriving it wrongly. Alternatives to weigh in the spec: batching all reads before all writes across sibling boxes, and seeding GSAP's own per-element transform cache so it skips the computed-style read.
- Regression coverage: jsdom mocks GSAP, so it can't observe layout thrash directly — the guard is a test asserting that a mounted `CabinetBox` sets its initial geometry without invoking `gsap.set` on the wall/front elements, plus a re-run of 17.2.1's harness confirming forced-layout counts drop.

### Docs

- `docs/ANIMATION_SYSTEM.md` updated for whatever mount-time contract results; `docs/COMPONENT_LIBRARY.md` if `CabinetBox`'s documented behavior changes.

## 17.2.4 Performance: Audio Scheduling Headroom (Tone lookAhead)

Requested by Crawford, 2026-09-18 — fourth of the 17.2.1–17.2.5 series (see 17.2.1). High priority as a safety net, not the fix — 17.2.2/17.2.3 remove the stalls; this makes whatever stalls remain (a slow phone will always have some) less audible. Not yet specced. **Needs Crawford's sign-off before implementation** — `CLAUDE.md` requires asking before changing the audio architecture; this is a tuning value rather than a structural change, but it bears directly on the documented `MIN_LEAD` reasoning.

Nothing in `src/` overrides Tone's context defaults (`AudioEngine.start()` just calls `Tone.start()`, `src/engine/AudioEngine.ts` ~line 463), so the app runs on Tone's `latencyHint: "interactive"` and `lookAhead: 0.1` (100 ms; verified in `node_modules/tone/build/esm/core/context/Context.js`). The transport only schedules events ~100 ms ahead, so any main-thread task longer than that risks late or dropped notes.

### Restructure

- Raise `lookAhead` (and let Tone derive `updateInterval` from it) to a value around 0.3–0.5 s, or switch to `latencyHint: "playback"`. Trade-off to settle in the spec: live parameter changes (Volume slider, Audio Rig sliders) respond later by up to the new lookahead — measure whether that's perceptible on the controls that matter most — and how it interacts with `MIN_LEAD` (50–100 ms) as applied in `AudioEngine.scheduleNote()`. Must be set before any Tone node is constructed (context creation time), not after.
- Verified against 17.2.1's harness: long tasks below the new lookahead stop producing audible gaps; confirm by ear on the phone, since headless Chrome has no real audio output.

### Docs

- `docs/AUDIO_SYSTEM.md` and `docs/BEAT_CLOCK.md` updated for the new lookahead and how it relates to `MIN_LEAD`.

**Closed without building, 2026-09-27 — confirmed by Crawford.** The Audio Load Budget (17.2.6, below) already solves the problem this item was a safety net for: its `latencyHint` preset switch (Light/Standard → `'playback'`, driven by `audioBudget.ts`'s `LOAD_PLAYBACK_BELOW`) covers the same "reduce audible dropouts on a slow device" goal this item scoped as one of its two options. Raising `lookAhead` itself was never implemented and, per Crawford, is no longer needed now that the Audio Load Budget work is in place — `src/` still has no `lookAhead` override anywhere; only the `latencyHint` switch shipped, and it shipped under 17.2.6, not this item.

## 17.2.5 Performance: Idle Paint & Composite Cost

Requested by Crawford, 2026-09-18 — last of the 17.2.1–17.2.5 series (see 17.2.1). High priority for the phone.

**Localized and fixed on desktop, 2026-10-02 (branch `perf/idle-paint`, unmerged as of writing); the real-phone confirmation is with Crawford.** See [docs/PERFORMANCE.md](../PERFORMANCE.md) "Idle paint & composite — roadmap 17.2.5" for the method, the ablation tables and the keep/revert ledger. A new harness, `npm run perf:idle` (`scripts/perf/idle-paint.mjs`), traces the idle blank hub in one Chrome session and re-traces it with one suspect switched off at a time, plus Chrome's own invalidation reasons per node. It found the whole ocean scene repainting at full viewport size on every frame, for two independent reasons: the `fill 4.8s` CSS transition on every lighting-driven factory fill (lightness steps every ~2 s, so some fill was always mid-transition, and a running transition style-invalidates its element every frame), and the robots and bubbles moving inside the same `<svg>` as the sixty static factories (any transform write re-rasterized them all). Fix 1 removes `FILL_TRANSITION`; fix 2 splits `OceanScene` into four stacked layers (static back, moving bubbles, moving robots, static front) with the moving ones promoted to compositor layers, moving bubbles out of `Factory.tsx` into `BubbleLayer`. Unthrottled, 6 s idle window: main-thread busy 3229 → 1672 ms, paint 1006 → 147 ms. A third change (robots as individually composited HTML elements) measured inside noise and was reverted, as the ledger records. The flicker overlay, rocker pulse and gradient rects were ruled out. What remains at idle is the robots' own per-frame cost (~0.8 s per 6 s) and the JS tick work the 17.2.1 profile already noted — not paint.

Visible change for the checkpoint: factory lighting now steps once a second with no fade (a 1 % lightness step, imperceptible by design), and every building's bubbles rise behind the robots and below the foreground row (Crawford's call after the first look: foreground-row bubbles used to pass in front of the robots).

Measured with nothing open at 4× throttle (blank hub, powered on, 6 s window): the main thread was ~84% busy at idle — ~5.0 s of "(program)" (native browser work, not JavaScript) out of a ~6.0 s window. The layout trace attributes most of it to paint and compositing rather than script: `LocalFrameView::RunPaintLifecyclePhase` ~3.1 s, `Paint` ~2.2 s, and `PaintArtifactCompositor::Update` ~1.8 s (compositor commit, which grows with layer count) across ~117 frames. Something in the always-visible scene repaints or re-layers every frame; JavaScript in the same window was small (GSAP ticker and React work under ~1.5 s combined). Suspects to check, none confirmed: the animated robot SVGs in `WorldView` (per-frame `setAttribute`/transform writes), the ocean scene's gradients/filters/shadows, the full-viewport `.screen-viewport::before` stripe overlay with its `bridgeFlicker` animation in `ScreenViewport.css` (opacity-only, so probably compositor-cheap, but its large gradient and `box-shadow` are worth ruling out), and the number of promoted compositing layers. Two further leads from 17.2.1's idle CPU profile (see `docs/PERFORMANCE.md`): the audio-swell tick (`tickAudioSwells` → `advanceActiveSwells` → `writeRobotValue` in `src/systems/audioSwells.ts`, scheduled on a `16n` repeat) was ~0.4 s inclusive of a 6 s idle window and appears to feed store writes that drive React re-renders (~0.5 s of `performWorkOnRoot`) — a cost that scales with robot count and runs whether or not any tile is open; and a native `createPeriodicWave` call (not referenced from `src/`, so Tone-internal) showed ~0.26 s self time at idle.

### Restructure

- Localize first, fix second: use 17.2.1's harness with Chrome's paint-flashing/layer-borders view or a trace narrowed to individual elements to find which element(s) invalidate every frame, then decide the fix per cause (cap repaint area, replace a filter with a precomputed asset, `contain`/`will-change` where it actually helps, reduce layer count). Any fix that touches robot animation goes through the "GSAP for animation, no `requestAnimationFrame` loops" rule in `CLAUDE.md` as usual.
- Confirm on a real phone before declaring it fixed — headless Chrome's software rasterization is not a phone GPU.

### About

Sequenced last because its cause is unknown and its numbers are the least trustworthy in headless Chrome; 17.2.1's harness is what turns it into something measurable. Likely overlaps with [18](../roadmap.md#18-cabinetry-verification-accessibility--performance)'s own performance check — this series' findings should land first so that pass verifies a UI that's already been through them.

## 17.2.6 Performance: Audio Load Budget

**Implemented 2026-09-20/21 — phone check run 2026-09-21 (results and reading in [scratchy-audio-phones.md](scratchy-audio-phones.md))** — see [docs/specs/AUDIO_LOAD_BUDGET.md](../specs/AUDIO_LOAD_BUDGET.md) (§8 "As Shipped") and [docs/tasks/AUDIO_LOAD_BUDGET.md](../tasks/AUDIO_LOAD_BUDGET.md); measurements in [docs/PERFORMANCE.md](../PERFORMANCE.md). Shipped as described below, with these outcomes: the **Audio Load** panel (Fleet Params → Transport & Composition, next to Tempo) with Light / Standard / Full presets and a fine slider; robots over the budget **stand by** (first come, first served, solo always sounds); polyphony ceiling, LFO tiers (drift off ≤ Standard, filter-frequency/Q LFOs off on Light, EQ-gain kept, robot LFOs capped 4 / 12 by *measured* cost) and the boot-time latency hint (Light and, since 2026-09-21, Standard → `playback`; decision J), all driven from one dial; default Light on phone-like devices; `?load=` pins it and the choice is mirrored into the URL; held-off LFO and drift controls grey out with a label; `?debug` shows `audible n/12` and the budget line; `npm run perf:audio` measures render capacity. **Desktop, same-session A/B against the pre-feature build:** Light −29 % (`charlie`) / −37 % (`bravo`) peak render capacity, Standard −13 % peak on `bravo`, Full unchanged (±0.03), robot-LFO stress at the caps < 0.9. **One gate missed** — Standard's mean on `bravo` is 0.069 below Full (needed ≥ 0.10); accepted and re-set on 2026-09-21 (spec decision N). **Phone check (2026-09-21, Pixel 8, by ear, one take per cell):** Light was the only preset clean or near-clean on both worlds; Standard and Full clicked or dropped out on `bravo`. The output diagnostic (below) then settled decision J with real data: a same-session, same-world (`bravo`) comparison gave Standard/`interactive` 1227 playback underruns over ~5 minutes against Standard/`playback` 186 — about 6.6× fewer, closely matching what was heard — at the same ≈266 ms average output latency cost Light already ships unremarked. **Standard now ships with `playback` too** (`LOAD_PLAYBACK_BELOW` raised from 0.4 to 0.61, so it sits above Standard's anchor and below Full's). `charlie` was not tested for this pairing. `bravo` Full also dropped out on a rested, unplugged phone (~15 s, then one still unrecovered after 40 s), each time with the `?debug` overlay showing nothing wrong — this and the missing `charlie` check for decision J were exactly what the output diagnostic, built the same day, was for. It also confirmed the clicks are playback underruns and no full dropout recurred in the three runs that exercised it. See [specs/AUDIO_OUTPUT_DIAGNOSTIC.md](../specs/AUDIO_OUTPUT_DIAGNOSTIC.md) (implemented, incl. Crawford's phone run) and [scratchy-audio-phones.md](scratchy-audio-phones.md). **Update 2026-09-22:** the single Audio Load dial above was split into two independent sliders — **Robot Load** (audible-robot cap, polyphony, the boot-time latency hint) and **Effects Load** (drift, filter LFOs, the robot-LFO cap) — per Crawford's request, so a user can trade the two off separately instead of moving them together; the three presets still set both in one click. `?load=` keeps pinning Robot Load (and, when `?fxLoad=` is absent, Effects Load too, for back-compat); `?fxLoad=` pins Effects Load independently. Also: held-off LFO/drift controls now display `0`/deselected instead of their real stored value while greyed out, and the held-off accent color was refined from a flat white/black to a monochrome slate gray. Not yet re-run on the phone against the two-slider split specifically — behavior at "both sliders equal" is unchanged from the tested single-dial version. See `docs/AUDIO_SYSTEM.md`'s Audio Load Budget section and [specs/AUDIO_LOAD_BUDGET.md](../specs/AUDIO_LOAD_BUDGET.md) §1.2 for the current API. Merged to `main` via PR #485/#486 (`630aa34`), 2026-09-22 — the two-slider split itself included; only the phone re-run against that specific split remains outstanding.

Requested by Crawford, 2026-09-20 — added to the 17.2.x series after the phone investigation ([docs/todo/scratchy-audio-phones.md](scratchy-audio-phones.md)) showed the Pixel 8 clicking and dropping out while the `?debug` overlay stayed green (the audio thread missing its buffer deadline is the working, unproven explanation). High priority. **Specced (draft v3, Crawford's decisions folded in; one open question — Standard's latency hint), awaiting final approval:** [docs/specs/AUDIO_LOAD_BUDGET.md](../specs/AUDIO_LOAD_BUDGET.md); tasks not yet written.

Measured on desktop with pinned worlds (`?seed=&x=&y=`): render load follows how many robots are sounding at once (in ~1–2 minute waves), the seed's global LFOs — half of whose cost is **drift** ("stacked" LFOs), and filter-frequency/Q LFOs cost ~10× EQ-gain LFOs — and, if a user enables many, robot LFOs (51 saturate the audio thread even on desktop). Nothing today limits any of these except the fixed 12-robot roster and `MAX_POLYPHONY = 16`.

### Restructure

- One user-adjustable **Audio Load** dial (Light / Standard / Full presets plus a fine slider, in Audio Rig → Transport & Composition, next to Tempo) lowers cost in four ways: caps on **audible robots** and **polyphony**; **LFO tiers** (drift off on Standard and below, filter-frequency/Q LFOs off on Light, cheap EQ-gain LFOs kept, robot LFOs capped by count); and the **latency hint** (Light selects `playback`, applied at page load only — a context's hint is fixed at creation).
- Over-budget robots stand by (silent, otherwise unchanged) first-come-first-served; **solo always sounds**. Full equals today's behavior exactly. LFO tiers only suspend connections — no stored value is ever changed.
- Default chosen automatically — lighter on phone-like devices — with `?load=` to pin it for testing and later sharing; the chosen preset is mirrored into the URL so a reload keeps it. A LFO held off by the dial is greyed out (values kept). No persistence work.
- Gating is at the note trigger only; no voice teardown (lazy voice chains is a deferred Phase B, measured to be a weak lever on its own).

### About

Absorbs the preset-driven part of 17.2.4 (`playback` latency, which helped the heavy world on the phone in one run); a raised Tone `lookAhead` stays held. Independent of 17.2.3/17.2.5.

## 17.2.7 Performance: Robot LFO Priming

**Implemented — see [docs/specs/LFO_LOAD_FIX.md](../specs/LFO_LOAD_FIX.md) and [docs/tasks/LFO_LOAD_FIX.md](../tasks/LFO_LOAD_FIX.md). Branch `bug/LFO-load`, unmerged as of writing.**

Seeded robot LFOs showed in the UI but never reached the engine — only a user edit ever connected one. `primeRobotLfos`/`primeRosterLfos` (`src/systems/robotLfoPriming.ts`) close the gap at every point a robot's voice is (re)reserved: spawn, power-on, a structural voice rebuild (also fixing a second bug — a user-connected robot LFO going silent on a layer-type change), and session load. The `volume` and `layerN.pulseWidth` LFO targets were removed and the seed odds lowered from 50% to 25% on to keep the primed count sustainable (9 targets now, not 13). The Task 11 perf gate found Full's previously-`Infinity` robot-LFO cap saturating the audio thread once priming made the cost real (bravo peak render capacity 0.40 → 0.998 at ≈18 connected robot LFOs); `ROBOT_LFO_CAP_FULL` gives Full a finite cap (equal to Standard's, 12), re-measured passing with a wide margin (peak 0.443). See `docs/PERFORMANCE.md` "Robot-LFO priming — the Task 11 perf gate" for the full measurement.

**Not Doing:** control-rate robot LFOs (`layerN.phase` already polls at control rate and stays uncapped by design); raising the global-chain LFO odds (34%, untouched — out of scope). **Superseded by [17.2.8](#1728-performance-lfo-bank) below** — the per-target engine/priming/cap this item built was replaced outright, not extended.

## 17.2.8 Performance: LFO Bank

**Implemented — see [docs/specs/LFO_BANK.md](../specs/LFO_BANK.md) and [docs/tasks/LFO_BANK.md](../tasks/LFO_BANK.md). Branch `feature/LFO-pool`, unmerged as of writing.**

Replaces one private `Tone.LFO` per modulation target (the 17.2.7 design above) with four shared, world-level, app-lifetime LFO lanes — a target now links to a lane and stores a depth instead of owning its own oscillator. Twenty tasks in five phases: Phase 1 deletes what the bank makes pointless (the `layerN.phase` target, the robot-LFO cap, the per-target held-off machinery); Phase 2 builds the bank (`src/engine/lfoEngine.ts`, renamed from `lfoBank.ts`) beside the old engine; Phase 3 flips the data/wiring so a seeded world is primed through the bank; Phase 4 swaps every panel to the inline `LfoLink` (Lane + Depth) primitive, replacing the old shared `Lfo`/`LfoTargetGroup` display and the 4-group Drift accordions (EQ/Low-Pass/High-Pass/Robot Drift) with one LFO Bank accordion (4 lane panels, each with its own Shape/Rate/Rate Drift/Depth Drift); Phase 5 deletes the old per-target engine entirely, moves persistence to session payload v2, and runs the perf gate (Task 19 — both the hard gate and the success bar passed with a wide margin on the measured worlds). `RobotLfoTargetId` is 6 now (`layer{0,1,2}.{gain,detune}` — Phase was cut, having never had a live Signal); global on-odds are 66%, robot on-odds 30% (correcting 17.2.7's own "25%" figure for the same coin flip, now reused by the bank's seeder). See `docs/AUDIO_SYSTEM.md`'s LFO Modulation section for the full current design.

**Not Doing:** the intent doc's own out-of-scope list (`docs/intent/lfo-bank.md`) — control-rate/polled bank LFOs (rejected in favor of real audio-rate nodes, may be revisited); per-link polarity/invert or other decorrelation (lockstep is wanted); lane-based load degradation (Light/Standard/Full all run all four lanes — only the filter switch and drift-off react to the dial); fixed lane "characters" with constrained ranges (the four lanes are seeded with spread rates but are otherwise blank, fully editable oscillators); migrating old sessions/share links (v1 payloads are stripped, not converted); a modulation-matrix overview UI (the per-target `LfoLink` picker is the UI).

**Follow-up (spec §7 risk 8, inherited knowingly, not fixed here):** an Attenuation Style switch while the context is already running does not re-prime the bank or global links — `regenerateLfoBankFromSeed`/`regenerateGlobalLfoLinksFromSeed` are data-only, and nothing re-primes until the next `AudioEngine.start()` (a full power cycle). Pre-dates this phase (the old per-target engine had the identical gap); fixing it is a one-line addition — `primeLfoBank`/`linkTarget` from the same AS-switch subscription, guarded by `isAudioContextRunning()` — not done here.

## 19. Test Coverage: Untested Core Modules

Requested by Crawford, 2026-09-16, following a source review of `src/` for coverage gaps left by early pre-testing-discipline work. `collisionSystem.ts` (`src/systems/`) was the one other module the review flagged — deliberately excluded here: it was unused (`startCollisionDetection` was never called from anywhere), and Crawford's call was to remove it outright rather than backfill tests for code likely to be rewritten from scratch if it's ever needed again. Removed 2026-09-16, along with `collisionSystem.test.ts` and its references in `powerController.ts`/`powerController.test.ts`. Not yet interviewed/specced.

### Create

Unit tests for the following, all currently untested despite carrying real logic (a tested sibling already exists in the same folder for most of them, e.g. `lfoEngine.test.ts`/`RobotBody.test.tsx`/`facadeGreebles.test.tsx`):

- `src/engine/lfoDrift.ts` — group-scoped rate/depth drift pools, the depth silence-guard connect/disconnect behavior, `driftGroupForTarget`'s prefix matching
- `src/engine/lfoShared.ts` — `centeredSwingFromRange` (has documented history as a real shipped bug, twice) and `connectAdditively`'s override-disable-then-restore sequence
- `src/utils/getSeededVal.ts` — `precomputeDataX`/`getSeededVal` determinism, since it underpins reproducibility across audio, locale, and spawn generation
- `src/components/ui/controls/sliderLogMath.ts` — the epsilon-floor curve, especially the `min = 0` edge case
- `src/components/ui/controls/accordionAnimation.ts` — reduced-motion duration branching
- `src/animation/swimAnimation.ts` — distance/duration calc, orientation-flip logic, propeller-rotation-count math in `createSwimTimeline`
- `src/animation/timelineMap.ts` — `setTimeline`/`getTimeline`/`killTimeline`/`killAllTimelines`, the registry every GSAP consumer depends on
- `src/utils/refs.ts` — `setRef`/`getRef`/`deleteRef`/`clearRefs`
- `src/utils/helpers.ts` — `swallow`/`devWarn`/`getScreenViewportDomNode`
- `src/components/robot/RobotAngular.tsx`, `RobotIndustrial.tsx`, `RobotOrganic.tsx`, `RobotSleek.tsx` — the four shape variants `selectRobotShape` (`robotVisualHelpers.ts`) chooses between and `RobotBody.tsx` renders; `robotVisualHelpers.test.ts`/`RobotBody.test.tsx` cover selection and props-threading but not each variant's own rendering
- `src/components/actors/factoryVariants.ts` — `getVariantFromNoise` and `selectVariantFromSeed`, whose PRNG draw order is explicitly documented in-file as load-bearing ("must not be changed without updating tests") but currently has no test enforcing it
- ~~`src/components/actors/greebles/greebleTypes.ts` — confirm during implementation whether this is pure types (skip) or has real pool/logic content worth covering~~ — **dropped**, confirmed pure `type`/`interface` exports with zero runtime logic; nothing to test.
- `src/components/panels/screen/worldView/LocaleView.tsx`

### About

This phase backfills unit test coverage for a set of modules identified by source review as carrying real logic — deterministic seeding, animation timing math, signal-graph wiring, or SVG rendering variants — with no regression protection today, most of them extracted from or sitting alongside already-tested siblings. The goal is coverage parity with the rest of the codebase's established testing discipline, not new functionality; each item gets tests against its current, shipped behavior.

**Done** — see [docs/intent/test-coverage-core-modules.md](../intent/test-coverage-core-modules.md), [docs/specs/TEST_COVERAGE_CORE_MODULES.md](../specs/TEST_COVERAGE_CORE_MODULES.md), and [docs/tasks/TEST_COVERAGE_CORE_MODULES.md](../tasks/TEST_COVERAGE_CORE_MODULES.md). Implemented on `tests/core-modules-coverage`, one commit per task (12 tasks, 12 new test files, 140 test cases). Merged to `main` via PR #501. `collisionSystem.ts` needed no action (already removed 2026-09-16, as noted above); `greebleTypes.ts` dropped from scope, confirmed pure types (see the struck-through bullet above). Every named-risk assertion was mutation-tested (the real guard temporarily broken, confirmed the new test failed, then reverted) rather than just written and trusted — this caught one genuinely weak assertion (an idempotency check in `lfoDrift.test.ts` that measured the wrong thing) before it shipped. One real gap found and fixed in shared test infrastructure, not production code: `vitest.setup.ts`'s global GSAP mock had no `.play()` — no prior test had ever exercised `createSwimTimeline`'s call to it; added, and the full suite re-verified green immediately after. Full suite at completion: 187 files / 3904 tests, zero regressions; `npm run build:types`/`npm run lint`/`npm run build` all clean. Zero other production files modified — confirmed via `git diff --name-only main...tests/core-modules-coverage`, not just self-report.

## 20. Session Storage

### Create

- Persistence engine: a debounced Zustand `subscribe()` listener (not a polling loop) that background-saves to localStorage on changes to locale/seed, Audio Rig settings, or Robot Options overrides
- State resolver: URL query string → localStorage cache → fresh procedural seed, in that fixed priority order
- URL state serializer: native `CompressionStream`/`DecompressionStream` (`'deflate-raw'`) plus base64url encoding, with an uncompressed base64url fallback if `CompressionStream` is unavailable — no new dependency
- FirmwareResetModal: an `AlertDialog`-based full-state wipe (clears localStorage, strips the URL query string, regenerates at a fresh procedural baseline), with a GSAP flash timeline registered in timelineMap, labeled `SYSTEM_FIRMWARE_RESETS` in the UI — the flash timeline respects `prefers-reduced-motion` (same pattern as PowerRockerSwitch.css), skipping straight to the reset when set

### Restructure

- Persisted state is a diff, not a snapshot: active seed/coordinates, global Audio Rig settings, and a per-robot override map (keyed by robot ID) holding only the fields an operator explicitly changed in Robot Options — everything else regenerates from the seed on load
- Depends on Phase 6's robot IDs becoming deterministic, so overrides can be reapplied by ID after the roster regenerates

### About

This phase replaces the (currently nonexistent) session/storage handling with an automated background persistence engine, URL serialization, and a strict state-loading hierarchy. There is no localStorage or persistence code anywhere in src/ today, so this is greenfield — the only thing to remove is the SESSION console tab stub, already handled by Phase 3. We are building src/utils/storageEngine.ts (flat alongside the rest of src/utils/) to debounce-save on meaningful Zustand store changes rather than polling on a fixed timer, acting like a rugged field recorder's non-volatile flash storage. We are implementing src/utils/stateResolver.ts to enforce the fixed startup resolution order — URL payload, then localStorage, then a fresh procedural seed — and src/utils/urlSerializer.ts to compress state with the native CompressionStream API into a dense, URL-safe string for direct link sharing. Because robot attributes are already fully seed-derived (see PROCEDURAL_GENERATION.md), the persisted/shared payload is a small diff — seed, coordinates, Audio Rig settings, and any operator overrides from Robot Options — reapplied on top of a freshly regenerated roster, not a full snapshot. Finally, we are building FirmwareResetModal.tsx (Radix AlertDialog, GSAP flash timeline via timelineMap) to handle full state wipes styled as a hard diagnostic system reset (SYSTEM_FIRMWARE_RESETS), keeping the industrial telemetry aesthetic consistent with the rest of the console.

**Done** — see [docs/intent/session-storage.md](../intent/session-storage.md), [docs/specs/SESSION_STORAGE.md](../specs/SESSION_STORAGE.md), and [docs/tasks/SESSION_STORAGE.md](../tasks/SESSION_STORAGE.md). Implemented on `feature/session-storage`, one commit per task. **What actually shipped is narrower than the "Create"/"Restructure" description above** — that description was superseded during `interview-me`/spec (2026-09-27), before Task 1 started: a "Sessions" accordion (Settings, third/last leaf) for multiple named local saves (not one boot-autoloaded slot), a 6-slot autosave (5 rotating + 1 draft) on a plain 5-minute `setInterval` (not a debounced `subscribe()` listener), and no URL involvement of any kind — no state resolver, no `CompressionStream` serialization, no shareable link. That work is tracked separately as [Phase 21](#21-sector-settings-shareable-link-importexport), which depends on this phase but hasn't been built. `FirmwareResetModal` as originally scoped wasn't built either; a narrower "Clear Local Storage" button (wipes all of `localStorage`, resets the loaded-session pointer, no URL-stripping or GSAP flash) shipped instead, plus three more UI additions made after the original 12-task plan: an "Update" button for overwriting the currently-loaded named session in place, autosave-slot labeling by world identity instead of a generic string, and per-slot autosave deletion (the last one reverses an explicit out-of-scope call in the intent doc — see `docs/specs/SESSION_STORAGE.md`'s own "Reversed 2026-09-28" note). `docs/SESSION_STORAGE.md` is rewritten to describe the shipped design. Full suite at last check: 195 files / 4020 tests, one known-flaky real-RNG test (`worldTransition.test.ts`'s swell-clear precondition, `docs/todo/backlog.md` item 15 — unrelated to this work, confirmed passing in isolation); `npm run build:types`/`npm run lint` clean. Manually verified in-browser throughout implementation (Crawford).

### Docs

- docs/SESSION_STORAGE.md rewritten from the shipped implementation (Task 12) — no more "not yet implemented" banner. Already on CLAUDE.md's reference doc list. docs/UI_SHELL.md's Settings row updated to list Sessions alongside Audio Profile/Audio Seeds (and to drop the already-stale Volume/Tempo mentions — both relocated out of Settings before this phase started).

### 2026-09-28: Session Autosave History amendment scoped, built, then cut

A follow-on amendment to this phase — replacing the 6-slot autosave above with a per-named-session 3-deep FIFO history plus two unsaved-work buckets, a drill-down UI, and a "Primary Save" label — was interviewed, specced, and partially implemented on `features/session-updates` (`docs/intent/archive/session-autosave-history.md`, `docs/specs/archive/SESSION_AUTOSAVE_HISTORY.md`, `docs/tasks/archive/SESSION_AUTOSAVE_HISTORY.md`, all now marked `Status: cut. Do not implement.`). Crawford called it too complicated for a v1 before it merged and had it fully removed, going back to manual-only CRUD with no autosave of any kind — see [docs/intent/session-autosave-removal.md](../intent/session-autosave-removal.md), [docs/specs/SESSION_AUTOSAVE_REMOVAL.md](../specs/SESSION_AUTOSAVE_REMOVAL.md), and [docs/tasks/SESSION_AUTOSAVE_REMOVAL.md](../tasks/SESSION_AUTOSAVE_REMOVAL.md). `docs/SESSION_STORAGE.md` is rewritten again to reflect the autosave-free end state; the "Update" button mentioned above was already reverted to "Load" as part of the cut work, before the removal even started.

## 20.5. World Clock: Deterministic Lifecycle Replay

Requested by Crawford, 2026-09-28, out of an `/idea-refine` session prompted by asking whether robot battery/docking/job state should be persisted in Session Storage (20). Sequenced here, ahead of [21](#21-sector-settings-shareable-link-importexport) and [32](../roadmap.md#32-robot-melody-history--configuration-scrubber), because both depend on it: 21 wants a share link to reproduce an exact audible *moment* (not just tuning), and 32's scrubber needs a principled way to recompute world state at an arbitrary point, not just melody.

### About

Robot battery/docking/job (`docs/ROBOT_LIFECYCLE.md`) is currently the one piece of "who's playing when" that isn't reproducible from a seed the way melody now is (Phase 31) — it drifts continuously with elapsed measures and isn't captured by Session Storage's diff-based payload at all (deliberately excluded, `docs/SESSION_STORAGE.md`'s "Explicitly never persisted" list). Verified while scoping this: `spawnInitialRoster` (`spawnSystem.ts`) already seeds every robot's starting `batteryLevel`/`docking` deterministically from the noise map, and the tick logic in `robotSystems.ts` (drain/recharge rates, threshold crossings, `scoreJobAffinities`) is pure arithmetic with zero `Math.random` calls. The only non-deterministic ingredient is elapsed real time. This phase introduces a single tracked "world clock" (elapsed measures since roster creation) and refactors the lifecycle tick into a pure, headless step function — mirroring what Phase 31 already did for melody generation — so battery/docking/job become a deterministic function of `(seed-derived spawn state, world clock)`, replayable in a tight loop instead of only live via BeatClock.

An audit pass comes first, before any refactor: trace every other timing-dependent system (LFO drift, audio swells, ping-variance automation) to confirm — or disprove — that they're already measure-quantized and safe, per `CLAUDE.md`'s existing no-`setInterval`-for-musical-timing guardrail, rather than assuming it and finding gaps piecemeal later.

### Not Doing (and why)

- **Wiring this into Session Storage's `SessionPayload` or Phase 21's share links** — downstream consumers, once the primitive exists and is proven; this phase is the foundation, not the feature.
- **Building Phase 32's scrubber UI** — already tracked separately, depends on this landing first.
- **A "checkpointed replay" performance optimization** (memoizing lifecycle state every N measures so long-elapsed replays stay cheap) — stays a fallback, not built until a real perf check says it's needed.
- **Fixing every issue the audit surfaces in this same pass** — audit output may warrant its own follow-up phase(s) rather than snowballing scope here.

See [docs/ideas/world-clock-deterministic-lifecycle-replay.md](../ideas/world-clock-deterministic-lifecycle-replay.md) for the full `/idea-refine` writeup, if saved.

**Done** — see [docs/intent/world-clock-deterministic-lifecycle-replay.md](../intent/world-clock-deterministic-lifecycle-replay.md), [docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md](../specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md), and [docs/tasks/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md](../tasks/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md). Implemented on `feature/worldclock`, one commit per task (9 tasks). **Scope expanded beyond this section's own "About" framing**, discovered and confirmed with Crawford during the spec pass, before Task 1 started: dock-triggered melody pitch drift (`reRollMelodyPitches`, previously seeded by a live-only `dockCycleCounters` counter) is now replayable too, not "untouched" as first scoped — it's the audible part of "share exactly what you're hearing," this phase's own motivation, and turned out to fall out of the replay loop for free once replay was confirmed to always fully re-simulate from the locale's creation measure rather than ever resuming from a mid-point checkpoint. On-screen position/movement was confirmed out of scope instead (it was never measure-snapshot state to begin with). The audit (§"About"'s "comes first") actually ran last in implementation order — non-blocking, per its own task's design, since battery/docking/job's determinism was already independently confirmed by direct code reading before any refactor started; findings recorded in `docs/todo/backlog.md` item 17. A pre-existing, unrelated `Locale.currentMeasure` field was found dead/vestigial during the spec pass (never incremented by the real tick system) — left untouched; the new `createdAtMeasure` field is distinctly named, not a repurposing. `landOnDocked`'s signature changed (takes the already-drifted melody as a parameter instead of computing it) as a direct consequence of the melody-drift expansion. No consumer (Session Storage, Phase 21, Phase 32) wires this in yet — proven by a dedicated headless "prove-it" test (`robotSystems.test.ts`), mutation-checked against a broken invariant guard and against wiring the wrong melody into a landing, not a manual browser check (there is nothing to click). Full suite at completion: 192 files / 4050 tests (one known-flaky real-RNG test, `worldTransition.test.ts`'s swell-clear precondition, `docs/todo/backlog.md` item 15 — unrelated to this work, confirmed passing in isolation); `npm run build:types`/`npm run lint`/`npm run build` all clean.

**Post-"Done" fix (2026-09-28):** a `/code-review-and-quality` pass after this note was first written found a real correctness bug: `stepRobotLifecycle` cleared a landing robot's `job` to `undefined` on Departing→Docked, but the real live path (`landOnDocked`'s `updateRobot` call) never touches `job` at all, so it silently persists stale in the actual running app. The prove-it test didn't catch it because its Departing fixture robot started with `job: undefined`, so the comparison passed on `undefined === undefined` without ever exercising a robot that already held a job when it departed. Fixed by deleting the `job = undefined` line (`robotSystems.ts`, Departing→Docked branch) so replay matches live behavior; the prove-it fixture and the dedicated Departing→Docked unit test were both strengthened with a robot holding a real job before departing, so this class of bug can't hide behind an undefined-vs-undefined comparison again. `docs/ROBOT_LIFECYCLE.md` and `Robot.job`'s own doc comment (`src/types/Robot.ts`) previously documented the *wrong* invariant ("undefined while Docked") — corrected to describe the actual (and now enforced-in-replay) behavior: job persists, stale, until the robot's next Active landing reassigns it.

## 21. Sector Settings: Shareable Link Import/Export

Requested by Crawford, 2026-09-16. Depends on [20](#20-session-storage) (Session Storage), shipped. **Correction, found while scoping this phase (2026-09-28): the sentence above originally claimed this phase "reuses Session Storage's `urlSerializer.ts` compression/encoding and `stateResolver.ts`'s URL-priority resolution" — neither file exists in this codebase, and no prior URL-sharing mechanism of any kind had been built. This was new work, not a wiring-up of an existing primitive** (see `docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md`'s own header note for the same correction, found independently while writing that spec).

### About

**Original framing (superseded, kept for history — see "Done" below for what actually shipped):** Session Storage (20) makes a shareable link *possible* — the URL query string already carries a compressed, resolvable session payload — but today the only way to get one is to manually copy the browser's own address bar, and the only way to load one is to paste it there and reload. This phase adds explicit Export (generate and copy the current session's shareable link) and Import (paste a link or raw payload and apply it) controls to `SectorSettingsDrawer`, so sharing a session is a deliberate, discoverable in-app action rather than an address-bar trick a user has to already know about. Directly closes the "shareable link" half `docs/todo/backlog.md`'s existing Attenuation Style presets note is waiting on — Crawford wants to update the in-app preset list with current, shareable links once this lands.

**Done** — see [docs/intent/sector-settings-shareable-link.md](../intent/sector-settings-shareable-link.md), [docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md](../specs/SECTOR_SETTINGS_SHARABLE_LINK.md), and [docs/tasks/SECTOR_SETTINGS_SHARABLE_LINK.md](../tasks/SECTOR_SETTINGS_SHARABLE_LINK.md). Implemented on `feature/sharing`, one commit per task. **Scope narrowed from the original "About" framing above, confirmed with Crawford during `interview-me`:** no manual "paste a link or payload" Import UI — the only import path is opening a URL with `?session=` present; no compression (plain base64 JSON, one URL param); and the two Share buttons live in the existing Sessions panel (`SessionListItem.tsx`/`SessionsPanel.tsx`), not a new `SectorSettingsDrawer` Export/Import control. A real scope EXPANSION also happened, found only by tracing `worldTransition.ts`/`seedUtils.ts`/`noiseMaps.ts` directly during the spec pass: the pre-existing `?seed=`/`?x=`/`?y=` debug params were removed entirely (not just deprioritized) — reusing their persistent, sanitizing override mechanism for the share link would have both mangled the shared Attenuation Style's exact name and silently hijacked the seed of every *other* Attenuation Style created later in the same session. See `docs/SESSION_STORAGE.md`'s "Shareable Links (Phase 21)" section for the full boot-sequence design (a two-phase load — locale pinned before first paint, audio/robot overrides settled in just after — is what makes opening a link flash-free) and `docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md` §7 for the two load-bearing design decisions Crawford confirmed before implementation. Automated suite green (`npm run build:types`/`npm run lint`/`npm test`/`npm run build` all clean) at every task-file checkpoint. **Manual verification (Checkpoints B/C): passed — Crawford's own visual/click-through test, 2026-09-28.** Two follow-up encoding-compaction commits landed after this (abbreviated/omit-when-empty wire keys, extended two levels deep for `robotOverrides`/`companyDiffs`) — see `docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md`'s "Post-implementation follow-ups" note. Phase 21 is done.

## 22. Navigation & Layout Rewrite

Number assigned by Crawford 2026-09-23. Source of intent: [docs/intent/nav-layout-rewrite.md](../intent/nav-layout-rewrite.md). Source spec/task plan: [docs/specs/NAV_LAYOUT_REWRITE.md](../specs/NAV_LAYOUT_REWRITE.md), [docs/tasks/NAV_LAYOUT_REWRITE.md](../tasks/NAV_LAYOUT_REWRITE.md) — 22 tasks, one commit each, on `feature/nav-layout-rewrite`.

### Restructure

- Replaces the flat 3-tile `Header` `RadioButton` nav (Robots/Audio Rig/Sector Settings) with a schema-driven, hand-rolled ARIA tree (`NavTree`/`NavPanel`/`NavToggleButton`/`ContentPane`, `src/data/navTreeConfig.ts`) — docked left on desktop/tablet, an off-canvas slide-over on mobile. 4 top-level branches: Settings, Fleet Params, Probes, Companies (`HubTile` gains a 4th value).
- Relocates Volume/Tempo/Quality out of `Header`/`AudioRigDrawer` into a new Settings branch; Sector Settings moves in unchanged.
- Retires `AccordionContainer` entirely — its 6 real consumers (`AudioRigDrawer`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`, `RobotFilterPanel` — already accordion-free by the time this shipped — and `AudioSettingSection`, found mid-migration) each became one tree leaf's content instead of a collapsible section; the component, `accordionAnimation.ts`, `src/testUtils/openAccordions.ts`, and the `AccordionSchema` `ControlSchema` variant are deleted (`CONTROL_SCHEMA_TYPES` 14 → 13).
- Wires the Probes branch's dynamic per-robot subtree and a new "All Probes" bulk-edit leaf, and the Companies branch's dynamic per-company subtree with CRUD (Create/Rename/Delete, the app's first confirmation dialog — Radix `AlertDialog`) relocated in from the old `CompanyManager`/`CompanyButtonRow`.

**Done** — full suite green (3371 tests, `feature/nav-layout-rewrite` tip `ce329a7`), `build:types`/`lint`/`build` all clean throughout. Merged to `main` via PR #489 (`caf21a1`), 2026-09-24. Checkpoint 4 (manual click-through across all 4 branches at mobile/tablet/desktop widths, a screen-reader pass, `prefers-reduced-motion` verification, and final review with Crawford) is **confirmed complete** — the ~9 PRs of hands-on nav/content polish that immediately followed this merge (#491–#498, all touching this exact UI) constitute that review in substance, per Crawford. Three deviations from the original plan, each confirmed with Crawford rather than assumed:
- **`CompanyManager`/`CompanyButtonRow` were deleted outright, not migrated**, and `RobotFilterPanel` (the Robots tab's own company-filter sidebar) was deleted alongside them — the plan's own file list never mentioned `RobotFilterPanel` depended on `CompanyManager` for an unrelated, pre-existing feature (filtering the robot browse list by company). Filtering that list by company now means visiting the Companies branch first — a real workflow change, not an oversight.
- **Two new `uiStore` fields beyond the plan's original §1.3 list**, both following its own established per-field pattern rather than one generic node-id scheme: `allProbesSelected` (disambiguates the bare "Probes" browse node from the "All Probes" bulk-edit leaf, both of which otherwise read `selectedRobotId === null`) and `clearSelectedCompany` (resets `selectedCompanyId` alone when navigating to the bare "Companies" node, without touching the unrelated `allRobotsSelected` flag). `selectedSettingsLeaf`/`selectedFleetParamsEffect`/`expandedTopLevelBranch` were also added beyond the original list, earlier in implementation (Tasks 11/14, and a live bugfix respectively).
- **A live bug, found by Crawford in the browser, not by any test**: the top-level branch nodes' own `+`/`−` expand button was a silent no-op from Task 3 onward through Checkpoint 3 — `useNavTree`'s `toggleExpand`/`isExpanded` had a case for every per-child accordion-of-one field but none for a bare single-segment node id (the branch roots themselves). Masked because `NavTree.test.tsx`'s own hand-written fake `useNavTree` mock was, in this one respect, more correct than the real hook it stood in for.

### About

Confirmed via `/interview-me`, 2026-09-22 — full intent/spec/task trio agreed before implementation began. **Correction, 2026-09-27:** `bug/view-change-slowdown` did merge — as PR #484 (`dded768`), before this phase began — but it only ever shipped [17.2.1](#1721-performance-view-switch-profiling-harness--baseline) and [17.2.2](#1722-performance-lazy-mount-collapsed-accordion-content) (the profiling harness and the accordion lazy-mount). What this phase actually supersedes/moots is the unbuilt remainder of that series, specifically [17.2.3](#1723-performance-cabinetbox-mount-time-layout-thrash) (CabinetBox mount-time layout thrash) — the new one-node-mounted-at-a-time content model sidesteps that class of view-switch-stall problem by construction, so 17.2.3 never needed building. [17.2.4](#1724-performance-audio-scheduling-headroom-tone-lookahead)'s latency-preset work was separately absorbed by [17.2.6](#1726-performance-audio-load-budget); [17.2.5](#1725-performance-idle-paint--composite-cost)'s idle-paint cost is an orthogonal problem (unrelated to view-switching) this phase doesn't touch and remains open.

### Docs

- `docs/UI_SHELL.md`'s "Console Navigation" section rewritten in full — the old 3-tile model description replaced with the tree model as shipped, including the Node → Content Mapping table and every `uiStore` field this phase added.
- `docs/COMPONENT_LIBRARY.md` updated: primitive count 14 → 13, `AccordionContainer`'s table row removed, its own subsection folded into a historical note (its detailed "Lazy mounting" internals summarized rather than kept in full, per this phase's own task doc).
- `CLAUDE.md`'s `COMPONENT_LIBRARY.md` reference bullet updated to match (14 → 13); its `UI_SHELL.md` bullet needed no edit — still an accurate one-line summary.

## 23. Nav Panel — Scrollable Views + New Section Depth

Follow-up to [22](#22-navigation--layout-rewrite) (Navigation & Layout Rewrite), all 22 tasks shipped on `feature/nav-layout-rewrite`. Source of intent: [docs/intent/nav-panel-views-and-content.md](../intent/nav-panel-views-and-content.md). Source spec/task plan: [docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md](../specs/NAV_PANEL_VIEWS_AND_CONTENT.md), [docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md](../tasks/NAV_PANEL_VIEWS_AND_CONTENT.md) — 15 tasks across 6 phases, one commit each, on `feature/nav-layout-rewrite`.

### Restructure

- Replaces Phase 22's swap-model (each branch's content component rendering exactly one selected leaf) with a single continuous scrollable **view** per branch/entity, stacking every section in tree order, each wrapped in a controlled, single-open-at-a-time `AccordionContainer` — restored from git history (`ce329a7^`, where Phase 22 deleted it) and converted from an uncontrolled `defaultOpen` component to a controlled `open`/`onOpenChange` one (`CONTROL_SCHEMA_TYPES` 13 → 14).
- Adds a 4th tree level (`RobotSubsection`) under Probes/Companies' existing `RobotSection` leaves — `Output → Audio Settings`; `Melody → Rhythm, Frequency`; `Envelope → Ping Contour`; `Source → Baseline/Coaxial/Harmonic Oscillator, Probe Drift` — matching Fleet Params' existing 3-level depth. Node ids grow one segment (`probes.<id>.<section>.<subsection>`). "Volume" renders as "Output" and the Source child housing `RobotDriftPanel` renders as "Probe Drift" — both label-only renames; `RobotSection`'s `'volume'` value, `RobotDriftPanel`, and `globalAudio.lfoDrift.robots` are all untouched.
- New scroll/scrollspy/lazy-mount infrastructure: `src/utils/sectionRefs.ts` (a scroll-anchor registry mirroring `setRef`/`getRef`'s shape, scoped to content-pane anchors instead of top-level SVG refs) and `src/components/panels/screen/nav/useSectionObserver.ts` (one `IntersectionObserver` per view, doubling as scrollspy sync and the lazy-mount gate `AccordionContainer` used to own itself pre-Task-21). `NavTreeNode`'s click handler now calls `scrollToSection(node.id)` alongside `select(node.id)` — an instant, non-GSAP jump, a no-op for any section that hasn't lazy-mounted an anchor yet.
- `PingControlsDrawer`/`SignatureArrayDrawer` each gain new, independently-mountable exports (`PingControlsRhythmSection`/`PingControlsFrequencySection`; `SignatureArrayLayer`/`RobotDriftPanel`) to match the new subsection granularity — their old combined-drawer exports stay in the codebase, but nothing renders them once `RobotOptionsTab`/`CompanyOptionsSection` are rewired.
- `RobotOptionsTab`/`CompanyOptionsSection` each replace their old `switch (section)` with the stacked-accordion model — `CompanyOptionsSection` additionally loses its `section` prop, reading `selectedSection`/`selectedSubsection` from `uiStore` directly instead (matching `RobotOptionsTab`'s own pattern), and derives its own node-id prefix (`probes.all` vs `companies.<id>`) from `allRobotsSelected`/`selectedCompanyId` rather than a caller-supplied value.
- Two new `uiStore` fields: `selectedSubsection` (`RobotSubsection | null`) and `expandedProbeSection`/`expandedCompanySection` (one level deeper than `expandedProbeId`/`expandedCompanyId`).
- `select()` (`useNavTree.ts`) gains two behaviors beyond the original Phase 22 design: **first-leaf-on-parent-select** (selecting a bare branch or a mid-level group/section node opens that scope's first leaf-descendant, rather than leaving nothing selected — the single-open-accordion model has no "nothing open" state) and **ancestor auto-expand** (selecting any node also expands every tree row needed to reveal it — `expandedTopLevelBranch` always, plus the per-branch entity/section expand fields), the latter never actually implemented despite being assumed by this phase's own Task 6 doc comment.

**Done** — full suite green (3488 tests), `build:types`/`lint`/`build` all clean throughout every task. One real bug found and fixed by this phase's own cross-branch integration test (Task 14): selecting into Settings/Fleet Params cleared `selectedSection` but not `selectedSubsection`, leaving a Probes/Companies subsection selection stale in the store after navigating away — harmless today (`ContentPane` only renders one branch's content at a time) but exactly the kind of leak Task 14 exists to catch. Shipped as part of `feature/nav-layout-rewrite`, merged via PR #489 (`caf21a1`). Checkpoint 6 (manual browser pass across all 4 branches, a screen-reader pass, `prefers-reduced-motion` verification, and final review with Crawford) is **confirmed complete** — same basis as Phase 22's own Checkpoint 4 above (PRs #491–#498's worth of hands-on follow-on polish on this exact UI).

**Follow-up, 2026-09-24 (same day, before Checkpoint 6 review):** Crawford reversed the phase's own single-open-accordion design — nav clicks and scrollspy should never auto-open or auto-close an accordion. Adds `useAccordionOpenState` (manual, independent per-accordion open/closed state, multiple can be open at once) and rewires all 4 content components off the derived-open model onto it; nav clicks/scrollspy now only scroll/update `selectedX` fields for tree highlighting, never touching accordion state. `RobotOptionsTab`/`CompanyOptionsSection` reset to the default-open section whenever the entity changes (`resetKey`), so switching robots/companies doesn't carry over stale open state.

### About

Confirmed via `/interview-me`, 2026-09-24 — full intent/spec/task trio agreed before implementation began. Phase 22 gave each branch a tree whose clicks swapped the content pane to exactly one section; this phase replaces that with one continuous scrollable page per context, closer to how a real settings/preferences page reads, while reusing Phase 22's own tree/id/uiStore conventions rather than inventing a parallel scheme.

### Docs

- `docs/UI_SHELL.md`'s "Console Navigation" section updated in place: the swap-model description replaced with the view/accordion/scroll model, the Node → Content Mapping table rewritten for the stacked-sections reality, and the 2 new `uiStore` fields documented.
- `docs/COMPONENT_LIBRARY.md` updated: primitive count 13 → 14, `AccordionContainer`'s "(removed)" section replaced with "(restored and controlled)" describing its new `open`/`onOpenChange` contract, and 2 stale cross-references to its old uncontrolled behavior corrected.

## 24. Nav Panel: Underline Link & Deepest-Level Auto-Expand — Superseded

Added to this doc 2026-09-27 (a gap-fill audit found this phase had shipped with no roadmap entry at all). Confirmed via `/interview-me` — source of intent: [docs/intent/nav-underline-link-and-auto-expand.md](../intent/nav-underline-link-and-auto-expand.md).

### About

Two changes: a new `UnderlineLink` primitive — a thin, purely decorative 4px underline beneath a text label, popping via a simplified `CabinetBox`-style wall/face pop on hover/focus, colored by whatever trait color the row already resolved — replacing the full `CabinetBox`+`Button` chrome at the nav tree's two deepest levels per branch (mid/leaf under Settings/Fleet Params; section/subsection under Probes/Companies — never the top branch level or the entity level, both unchanged); and a "deepest-parent auto-expand" rule where expanding any node cascades expand-state down through every subsequent parent level, except an entity row (a robot/"All Probes"/a company) is never auto-expanded itself, only its children once it is expanded.

**Superseded 4 days later** — see [25](#25-nav-panel-replace-underline-with-a-colored-cabinet-box) below. The flat translating-bar underline was deliberately scoped as a prototype ("a genuinely simplified version of `CabinetBox`'s own cabinetry pop language," per the intent doc above) to validate the row-height/level-scoping decisions before building the real thing — which is exactly what happened. `UnderlineLink.tsx`/`.css`/`.test.tsx` no longer exist; the auto-expand behavior this phase introduced is unaffected by the replacement and remains live.

### Docs

- `docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md` kept as a historical record of the superseded design, cross-referenced from Phase 25's own spec rather than rewritten.

## 25. Nav Panel: Replace Underline with a Colored Cabinet Box

Added to this doc 2026-09-27 (same gap-fill audit as 24). Follow-up to [24](#24-nav-panel-underline-link--deepest-level-auto-expand--superseded), shipped 4 days later. Confirmed via `/interview-me` — source of intent: [docs/intent/nav-cabinet-box-underline-replacement.md](../intent/nav-cabinet-box-underline-replacement.md). Merged to `main` via PR #491 (`c95245e`), 2026-09-25.

### Create

- `CabinetBox` gains a new **optional** color-override prop, overriding `--color-accent` everywhere its own CSS hardcodes it (backing tint, top-face, left-face-inner, front face) for that one instance only — every existing consumer that doesn't pass it (`Button`, `Toggle`, `VoxelTrack`) renders identically to before. Color *resolution* is unchanged — still `node.trait ?? nearest-ancestor-trait`, just fed into `CabinetBox` instead of the retired `UnderlineLink`.
- The nav panel's same two deepest tree levels now render a small, textless, animated `CabinetBox` (renamed row component: `NavCabinetRow`) in place of `UnderlineLink`'s flat bar — same position (beneath the row's plain text label, full row width), thin at rest (~4px), popping 4px on hover/focus/press with the full wall/front-face/glow animation, entirely tinted in the row's resolved trait color (walls, backing, *and* front face — unlike Button/Toggle's neutral-front default, since there's no text on the front face here to make that default meaningful).

### Restructure

- **Deleted**, not renamed: `UnderlineLink.tsx`/`.css`/`.test.tsx`.
- Doc references updated to match: `docs/COMPONENT_LIBRARY.md`, plus a pointer added to `docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md`/`docs/intent/nav-underline-link-and-auto-expand.md` noting they describe the superseded design.

### About

Closes the gap between the prototype's "genuinely simplified" pop and the real Oblique Cabinetry pop language every other interactive control in the design system already uses, now that the underline pass had been live long enough to confirm the row-height/level-scoping decisions around it. Which tree levels get this treatment is unchanged from 24; only the box's own visual mechanism changed.

### Docs

- `docs/COMPONENT_LIBRARY.md` updated for `CabinetBox`'s new color-override prop and `NavCabinetRow`.

## 26. Fleet Params Content Rework

Added to this doc 2026-09-27 (same gap-fill audit). Confirmed via `/interview-me` — source of intent: [docs/intent/fleet-params-content-rework.md](../intent/fleet-params-content-rework.md); source spec/tasks: [docs/specs/FLEET_PARAMS_CONTENT_REWORK.md](../specs/FLEET_PARAMS_CONTENT_REWORK.md), [docs/tasks/FLEET_PARAMS_CONTENT_REWORK.md](../tasks/FLEET_PARAMS_CONTENT_REWORK.md). Merged to `main` via PR #492 (`31dc92a`), 2026-09-26.

### Restructure

- `FleetParamsContent.tsx` converges on one uniform shape: a single always-open outer panel (`getTraitColorStyle('spectral')`, replacing a bare `<div>`) → one section-level `IntroPanel` → exactly 4 group accordions (Pacing, EQ & Filters, Time & Space, Output — `FLEET_PARAMS_GROUPS`' existing ids/labels/traits), each a real, independently-open/closeable `AccordionContainer` (previously only Pacing was; the other 3 were a bare heading `<div>` over a flat list of individually-accordioned leaves).
- Each group accordion, when open, shows its own group-level `IntroPanel` followed by its leaves as plain stacked sections (each still its own scrollspy anchor) — no leaf gets its own accordion anymore, matching how Pacing's Tempo/Automatic Intensity already worked. Leaf content itself (every param control, LFO group, the Compressor's Decay Mode radio) is untouched — only the accordion/`IntroPanel` nesting around it changed.
- Tempo and Automatic Intensity grouped into one shared panel within Pacing (a same-session follow-up, `579f0fc`).
- Placeholder lore/human copy follows the convention `"${Section Title} LORE TITLE"` — real copy is a future pass, not part of this phase.

### About

The prior attempt left Pacing as the only group with the intended shape; this phase converges all 4 on it, using Pacing's *intended* shape (not its pre-existing code, which itself needed cleanup) as the template. A pure container/wrapping change — scrollspy/tree-highlighting and all existing leaf functionality work unchanged.

## 27. Nav ↔ Accordion Sync

Added to this doc 2026-09-27 (same gap-fill audit). Confirmed via `/interview-me`, 2026-09-26 — source of intent: [docs/intent/nav-accordion-sync.md](../intent/nav-accordion-sync.md); source spec/tasks: [docs/specs/NAV_ACCORDION_SYNC.md](../specs/NAV_ACCORDION_SYNC.md), [docs/tasks/NAV_ACCORDION_SYNC.md](../tasks/NAV_ACCORDION_SYNC.md). Merged to `main` via PR #495 (`8261763`), 2026-09-27.

### Create

- A lightweight imperative registry (mirroring `sectionRefs.ts`'s pattern) letting the nav layer reach into a content view's local `useAccordionOpenState` instance — deliberately not lifting accordion state into `uiStore`, preserving the 2026-09-24 reversal (Phase 23's own follow-up) that took accordion open/closed state out of any shared store.

### Restructure

- **Nav → content:** clicking a nav link opens the content view, scrolls to the target, and — if the target lives inside an accordion — opens that accordion via the new registry. Mobile-only: other open accordions in the same view/panel close first; desktop keeps today's no-auto-close behavior.
- **Content → nav:** opening an accordion expands any collapsed ancestor nav branch covering the corresponding nav item and pops that item's `NavCabinetRow` underline (`popped` computation gains an additional OR'd "section is open" condition). Closing an accordion only un-pops the underline — it never collapses nav state or changes `selectedSection`/`selectedSubsection`.
- Several nav-click sequencing bugs fixed in the same series: clicking "Pitches" now correctly opens Composition and scrolls to Note Variance; the Source accordion's id mismatch for Probes/Companies nav clicks fixed; nested accordion chains (Source's own children) now open fully, not just the first match; nav-click navigation now sequences view-switch → expand target → scroll (previously racy); a scroll-drift bug from lazy-mounted content settling after the jump fixed; an instant-looking fade-in (React fighting GSAP's opacity tween) fixed so a view only fades in after it settles when arriving from elsewhere.

### About

Makes nav clicks and content accordions bidirectionally linked, closing a gap Phase 23's stacked-accordion model left open: a nav click could scroll to a section without opening the accordion containing it, and opening an accordion gave no visual feedback in the nav tree.

## 28. Robot Section/Subsection Config Consolidation

Added to this doc 2026-09-27 (same gap-fill audit). Source of intent: a code-organization review conversation with Crawford, 2026-09-27 (no separate `docs/intent/` doc — see [docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md](../specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md) §1 for the write-up). Source tasks: [docs/tasks/ROBOT_SECTION_CONFIG_CONSOLIDATION.md](../tasks/ROBOT_SECTION_CONFIG_CONSOLIDATION.md). Merged to `main` via PR #496 (`9facb05`), 2026-09-27. **Note:** the spec doc's own header still says "Status: not started" — stale, never updated after implementation; the tasks doc's own 6 checked-off tasks and checkpoints, confirmed against the merged commits below, are the accurate record.

### Problem

Probes/Companies' section/subsection "shell" — which accordions exist for a robot/company, their ids, order, labels, and trait — was independently authored in 3+ places that didn't reference each other: `useNavTree.ts`'s `SECTION_CHILDREN`/`SUBSECTION_CHILDREN`, a partial copy in `robotSubsectionConfig.ts`, and hand-inlined `AccordionSchema` JSX repeated a third and fourth time across `RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` (each subsection id hand-typed 4-5 times per file). A real duplicate-value bug was found in passing: `robotSubsectionConfig.ts`'s `OSCILLATOR_LABELS` was word-for-word duplicated in `useNavTree.ts`'s own `SUBSECTION_CHILDREN.source` array.

### Restructure

- `robotSubsectionConfig.ts` extended into one canonical `ROBOT_SECTIONS_CONFIG` table (per-section `navLabel`/`trait`/`ownAccordionLabel`, per-subsection `navLabel`/`accordionLabel`/`mergedInto`), modeling the real asymmetry that not every section has the same shape (`source` is the one section with its own wrapping accordion around 4 nested children; `frequency` is the one subsection with no accordion of its own, merged into `rhythm`'s "Composition" accordion instead). `useNavTree.ts` migrates to read it.
- A new shared shell component, `RobotSectionAccordionStack` (a render-prop component, not a hook — a fact-check during implementation found `RobotDisplaySection` renders as a plain sibling before the accordion stack begins, not woven into it, so no structural fork was needed), collapses the actual JSX duplication. `RobotOptionsTab.tsx` and `CompanyOptionsSection.tsx` each migrate to render through it, one at a time (not in parallel), given ~1,978 lines of existing test coverage across the three files this touches most.
- `FIRST_SUBSECTION_OF`/`SOURCE_OSCILLATOR_SUBSECTIONS`/`OSCILLATOR_LABELS` kept as thin one-line derived exports over the new table rather than deleted outright, so no other import site needed to change.
- A real pre-existing discrepancy surfaced and resolved during Task 1: `useNavTree.ts`'s shipped `volume` section label was `'Levels'`, while 2 pre-existing tests expected `'Output'` — the shipped value was transcribed as-is (zero-behavior-change scope), not "corrected" to match the stale tests.

### About

A pure data-organization refactor, not a new feature or behavior change — every id string, rendered label, accordion default-open state, trait color, and DOM-output test assertion was required to stay identical. Adding, removing, reordering, or relabeling a subsection is now a one-line change in one file instead of a coordinated edit across up to 4 files and roughly 15 hand-typed string occurrences.

### Docs

- `docs/UI_SHELL.md` updated for `ROBOT_SECTIONS_CONFIG`/`RobotSectionAccordionStack`.

## 29. Nav Panel: Home Button, Welcome Text, Breadcrumb

Added to this doc 2026-09-27 (same gap-fill audit). No intent/spec doc found — shipped as direct implementation without the usual `/interview-me`/spec pass. Merged to `main` via PR #497 (`8ccb998`), 2026-09-27.

### Create

- A new `NavBreadcrumb.tsx`/`.css` component.
- A welcome `Textbox` shown in the nav panel's blank state (nothing selected).

### Restructure

- The nav panel's existing "Close" action becomes a "Home" button.
- `NavPanel.tsx`/`.css`, `ContentPane.tsx`/`.css`, and `useNavTree.ts` extended to support the above (17 files touched in total, including test files).

### About

A polish pass on the nav panel shipped in the same cluster of work as 24-28 above, without its own documented rationale — flagged here so the roadmap has a record of it existing, not because the intent behind it is known. Worth a short retroactive note from Crawford if the reasoning matters later.

## 31. Deterministic Robot Melody Generation

Requested by Crawford, 2026-09-28, converged via an `/idea-refine` session (not yet run through `/interview-me` or a spec pass — most of the shape is already confirmed below, but treat this as pre-spec). Directly motivated by a real gap found while implementing Session Storage (20): `regenerateMelody.ts` (fired on every edit to a robot's Rhythmic Density/Motif Length/Note Variance/Pitch Repeat) calls `generateMelodyForRobot()` with no seed, falling back to `Math.random()` — so a robot's melody is currently a one-way die roll, unreproducible from its own attributes. This also means an overridden robot's melody does not survive a Session Storage save/load round trip today, even though its attributes do.

### About

Gives every robot a `compositionSeed` field, set once at spawn like `id` (not reusing `id` itself — a dedicated field, matching this app's existing convention of a distinct dataId per seeded concern rather than overloading one). `regenerateMelody.ts` builds a seed key from `compositionSeed` plus the robot's current `rhythmicDensity`/`rhythmicMotifLength`/`noteVariance`/`pitchRepeat`/`octaveRange` and passes it to `generateMelodyForRobot`'s already-existing (currently unused) `opts.seed` parameter — no new generation logic, no stored melody data, no seed map. The same attribute values always produce the same melody for a given robot going forward; nudging a slider back to a prior value no longer rerolls it. `applyOctaveMin`/`applyOctaveMax` (`robotOptionsActions.ts`) start calling `regenerateMelody` too, closing a second pre-existing gap (octave edits currently don't touch melody at all) — octave range becomes part of what shapes the melody, per Crawford's request.

Bulk company edits (`CompanyOptionsSection.tsx`) already call `applyDensity`/`applyMotifLength`/etc. once per member robot, each with that robot's own live object — so once `regenerateMelody` is seed-aware, bulk-editing a company to identical settings automatically produces melodies that share rhythmic character without being identical note-for-note ("complementary, not unison," Crawford's explicit requirement) — no changes needed to the bulk-edit path itself.

The standalone Reset Melody control (`handleResetMelody`/`onResetMelody` in `RobotOptionsTab.tsx`, wired to nothing but a bare `regenerateMelody()` call) is removed outright — under full determinism there's nothing left for it to do that changing an attribute doesn't already do, and no replacement was requested.

Session Storage's existing robot-override diff (already covers all five seed-formula inputs) becomes sufficient on its own to guarantee melody fidelity across a save/load round trip, once this ships — no changes needed to `SessionPayload`'s shape.

### Not Doing (and why)

- **Persisting melody data directly** (the original alternative under consideration) — rejected: it's exactly the "store the derived state, not the recipe" anti-pattern this app (and Session Storage specifically) was built to avoid elsewhere.
- **A global settings→melody map with no robot identity** — rejected: would make any two robots with identical dialed-in attributes sound identical to each other, which reads as a bug on a 12-robot roster, not a feature.
- **An explicit "Reroll" action to replace the removed Reset Melody button** — not requested; full determinism was the explicit goal, not preserving an escape hatch for randomness.
- **Melody history / a way to navigate a robot's past melodies** — split out to [Phase 32](../roadmap.md#32-robot-melody-history--configuration-scrubber), which depends on this phase shipping first.

**Done** — see [docs/intent/deterministic-robot-melody-generation.md](../intent/deterministic-robot-melody-generation.md), [docs/specs/DETERMINISTIC_ROBOT_MELODY_GENERATION.md](../specs/DETERMINISTIC_ROBOT_MELODY_GENERATION.md), and [docs/tasks/DETERMINISTIC_ROBOT_MELODY_GENERATION.md](../tasks/DETERMINISTIC_ROBOT_MELODY_GENERATION.md). Implemented on `feature/deterministic-robot-melody`, one commit per task (9 tasks), full `interview-me` → `spec-driven-development` → `planning-and-task-breakdown` → TDD pipeline before any code changed. **Shipped scope is broader than this section's own "About" framing**, resolved during the spec pass before Task 1 started: this phase doesn't just seed `regenerateMelody.ts` — it unifies spawn-time and edit-time melody generation under one shared formula (`melodyGenerator.ts`'s new `buildSeededComposition`), retiring `spawnSystem.ts`'s separate `'melody.rand'`/`melodyCallIndex` mechanic. Without that unification, a robot's very first post-spawn edit — even reverted to its original value — would have permanently shifted it off its spawn-time melody; that "no first-edit ratchet" guarantee is the phase's actual capstone acceptance criterion, proven by a dedicated test in `spawnSystem.test.ts`. Also, `compositionSeed` feeds `generateMelodyForRobot` via its existing `opts.rand` (not `opts.seed` as this section's "About" describes) — `opts.seed` only accepts one stringified number, which can't cleanly fold in five additional attribute values; confirmed with Crawford before implementation, conditioned on the substitution introducing zero incidental randomness (verified with a `Math.random` spy in tests). One real, unplanned bug was found and fixed via the TDD cycle itself: `sessionDiff.ts`'s `applySessionPayload` patched a restored robot's attribute fields but never called `regenerateMelody`, so a robot's melody stayed the fresh seed-baseline one instead of matching its overridden attributes after a session load — `SessionPayload`'s shape needed no change (as this section predicted), but the apply logic did. Full suite at completion: 195 files / 4042 tests, `build:types`/`lint`/`build` all clean. **Manual browser verification not yet performed** — no live browser available during implementation, flagged rather than skipped.

## 33. Free | Sync Toggle

Requested by Crawford, 2026-09-30; re-scoped 2026-10-02 after the LFO Bank ([17.2.8](#1728-performance-lfo-bank)) replaced the per-target LFO Rate this was first designed against. Intent: [docs/intent/free-sync-toggle.md](../intent/free-sync-toggle.md) (its dated re-scope section wins), spec [docs/specs/FREE_SYNC_TOGGLE.md](../specs/FREE_SYNC_TOGGLE.md), plan [docs/tasks/FREE_SYNC_TOGGLE.md](../tasks/FREE_SYNC_TOGGLE.md). **Implemented — all 15 tasks on `feature/sync-toggle` (unpushed, unmerged as of writing); the manual checkpoints (A, D, E: tempo seeding, seeded mix + persistence, the final browser/Pixel pass) are with Crawford.**

### About

Each of the four LFO Bank lanes' Rate, and the global Delay's Time, gets a **Free | Sync** toggle, shown to the user as **Float | Anchored**. Free is what it always was (a plain Hz / seconds value). Sync makes the same slider step through note values of the tempo — `1/32` up to 4 bars, straight / dotted / triplet (20 in all, `src/data/noteValues.ts`) — so a lane or the delay locks to `audioStore.bpm` and follows a Tempo drag. Five toggles in the whole app; no robot, company, link, or other effect has one. The engine stays Hz-only: pure resolvers (`src/utils/tempoSync.ts`) turn a stored note plus the tempo into the float the engine receives, a `sync?` field on `BankLfoSettings` / `DelaySettings` (absent = Free, no migration) carries the choice, and the Free value is kept underneath. Fresh worlds seed some lanes and the Delay Anchored (slow lanes lean Anchored, fast lanes Float, Delay mostly Anchored), with every Free value byte-identical to its pre-Sync self (pinned by an oracle test). The choice persists through a save, and through a share link as a compact `y` code.

**BPM moved to the Attenuation Style.** So that a Sync seed draw can be computed from the style alone, the tempo is now seeded per Attenuation Style (`src/utils/bpmSeed.ts`, reseeding on a style change, not on a coordinates move), not per locale — this inverts `docs/specs/archive/BPM_CONTROL.md` §1.3. **Every unsaved world therefore gets a new tempo** (the tempo for a given style + coordinates differs from before); saved sessions and share links carry `bpm` and are unaffected.

UI: the toggle sits in a row of its own under the slider it affects, with its own label (`Anchoring` / `Tempo Sync`) beside a box whose content is the current mode's pair (`Float` / `Free`, `Anchored` / `Sync`). Along the way the work set a UI rule — **a control whose content changes holds the size of its largest content** — and fixed the nav toggle (☰ / ✕) to follow it, via the new shared `ToggleFacade`. See `docs/AUDIO_SYSTEM.md`'s "Free | Sync" and BPM sections, `docs/COMPONENT_LIBRARY.md`, `docs/SESSION_STORAGE.md`.

### Not Doing (and why)

- **Probe envelope times** — a later follow-up, once this has landed.
- **Reverb / Compressor times** — not tempo-meaningful the way a delay line and an LFO rate are.
- **Drift amounts** — a drift is a percentage of the rate; syncing it would add nothing the lane's own note doesn't. A synced lane keeps its Rate Drift (`RATE_DRIFT_APPLIES_TO_SYNCED`, one switch to change that).
- **Phrase Length** — a robot's, not a lane's or the delay's.
- **Per-target or per-robot sync** — rejected in the 2026-10-02 re-scope: the LFO Bank made Rate a four-lane property, so the toggle is per lane (plus Delay), not per modulated field.
- **An Off step on the Sync slider** — dropped (perf-neutral): a lane's `0` Hz stays the Free slider's own end.
- **Multi-bar dotted / triplet notes** — 2 and 4 bars are straight-only.
- **Fixing the pre-existing Attenuation-Style-switch lane re-prime gap** — `regenerateLfoBankFromSeed` is data-only (17.2.8's follow-up), so a style switch doesn't re-push the lanes to the running engine. This phase neither fixes nor worsens it: synced and Free lanes are equally stale until it is fixed.

## 34. Layout Updates Pass 2: Post-Sync-Toggle Row Reshuffle

Requested by Crawford, 2026-10-03, as a plain checklist (reproduced verbatim in the spec's §0). Spec [docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md](../specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md), plan [docs/tasks/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md](../tasks/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md). **Implemented — all 11 tasks on `layout/post-sync-toggle` (cut from `feature/sync-toggle`; unpushed, unmerged as of writing); the manual checkpoints (A–D: the look at ~360 / ~800 / ≥1024 px, and exactly 1024 px for the half-width Tempo Sync composition) are with Crawford.**

### About

A pure layout pass, no behaviour change. Nineteen sliders turn horizontal — the seven EQ/filter ones and the twelve probe-layer ones, which were the only vertical sliders in the app, so **no slider schema is vertical any more** (`src/data/sliderOrientation.test.ts` pins it; the primitives keep the mode, unused). Eight control pairs move onto shared rows, each a nested `'responsive'` `DirectionalPanel` (side by side on desktop, stacked below — the Compressor sub-rows' own shape): Shape | Rate and Rate Drift | Depth Drift on each LFO Bank lane; Delay Time (over its Tempo Sync toggle) | Repeats, and Reverb Length | Pre-Delay, each with the Amount slider on its own full-width row; Type | Gain and Phase | Interval on each probe layer. `LfoLink` lays Lane left and Depth right on desktop from the same tier, by its own CSS rather than a panel inside the primitive. EQ bands and filter params read top to bottom, each a horizontal slider over its Lane | Depth row. In Settings, Retransmit is aligned left and a saved session's timestamp sits beside its title.

### Not Doing (and why)

- **Removing the sliders' vertical mode** — it has no consumer after this pass, but deleting it touches the three primitives, the voxel-track maths and roadmap 11.1.5.x / 13's work; its own decision, "ask first" in the spec.
- **`'row'` on every tier for the compact pairs** — every pair is `'responsive'` (spec assumption 1); horizontal sliders have a 3-box floor and the nav panel is narrow below desktop.
- **Levels / Composition / Envelope, and Phase 30's open items** — not on the checklist.
- **Hoisting the fifteen per-file `stubMatchMedia` test helpers** — a separate cleanup.

## 35. World Palette Pull

Requested by Crawford, 2026-10-02 ("robots, buildings and bubbles more based on the UI color scheme"; the world "is very gray"). Idea [docs/ideas/world-palette-pull.md](../ideas/world-palette-pull.md), intent [docs/intent/world-palette-pull.md](../intent/world-palette-pull.md), spec [docs/specs/WORLD_PALETTE_PULL.md](../specs/WORLD_PALETTE_PULL.md), plan [docs/tasks/WORLD_PALETTE_PULL.md](../tasks/WORLD_PALETTE_PULL.md). **Implemented — all 7 tasks on `feature/world-colors` (unpushed, unmerged as of writing); Crawford's visual checkpoint passed after two tuning rounds (red, then lime).** First of a three-branch series from one `/idea-refine` session; the other two ([parametric robot hull](../ideas/parametric-robot-hull.md), [layer pods](../ideas/layer-pods-and-follow-through.md)) are idea one-pagers only, not yet interviewed or specced.

### About

Factories, and through them their bubbles, lean toward the console's accent palette. Each Attenuation Style seeds a primary accent hue out of the 18 `ACCENT_COLORS` plus its nearest wheel neighbour; at placement, and again on a style retransmit, every factory's final body hue is pulled halfway toward one of the two (seeded coin per factory) and its saturation lifted by 15 points, with both deltas folded into the `hueShift`/`satShift` the actor already stores. No render path, store shape, robot file or CSS changed. The half pull, not a snap, exists because the console's 25%-transparent panels sit over the world. Two visual-checkpoint tunings added a saturation cap of 45% in two hue bands — warm 330→45 and lime 80→115 — because a warm or lime primary plus the 24-building Monolith row's own +40..60 variant saturation read "like candy". `src/utils/accentLean.ts` holds every constant; see `docs/BUILDING_DESIGN.md` "Accent Lean" and `docs/PROCEDURAL_GENERATION.md` for the two new dataIds.

### Not Doing (and why)

- **Robots** — dropped from this branch in the interview: they are not the grey part, and the parametric-robot-hull branch rewrites their colour mapping anyway (including the identityColor-on-the-body guardrail amendment, which this phase does **not** touch).
- **A lightness term** — Crawford: "I'm ok with there still being gray buildings." Stacks and Warehouse often still read grey; accepted.
- **Per-locale accent pairs** — per style, Crawford's call; two locales under one style share the pair.
- **Per-building accent variety** — one or two hues per style, never a rainbow; that was the oversaturation risk itself.
- **Hard snap or snap-plus-offset** — soft pull only.
- **The Ballast neutrals, bubble colours other than their building's, placement/variant/greebles** — untouched.
- **A simpler "replace the base with a jittered accent" model** — considered at spec review and rejected in favour of the pull.

## 36. Robot Live Visuals

Requested by Crawford, 2026-10-03, after the parametric hull (branch 2 of the earlier
world-visuals series) was set aside as not matching the app's look. First of a new three-branch
series on the existing four hand-drawn shapes. Idea [docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md), intent [docs/intent/robot-live-visuals.md](../intent/robot-live-visuals.md), spec [docs/specs/ROBOT_LIVE_VISUALS.md](../specs/ROBOT_LIVE_VISUALS.md), plan [docs/tasks/ROBOT_LIVE_VISUALS.md](../tasks/ROBOT_LIVE_VISUALS.md). **Implemented — all 13 tasks on `feature/robot-rework`; Crawford's visual checkpoint passed.**

### About

Deletes a spawn-time `visualAudioMap` snapshot of body scale/roundness/detail that never refreshed
on a Robot Options edit, replacing it with a live computation (`bodyShapeFromAdsr`,
`calculateBodyScale` — floored at `BODY_SCALE_MIN`, 1.5× the old unfloored minimum) so attack,
sustain and release edits visibly reach the body. The four shapes now scale about their own centre
(48,36) instead of the origin, and both avatar viewBoxes widen to frame the larger range without
clipping. Every shape's highlight/shadow shading switches from a fixed grey/black to the robot's
own hue-shifted colours (`colors.highlight`/`colors.shadow`). The window glass on every shape now
carries the robot's `identityColor` (`identityGlass()`), replacing a fixed blue, so a robot's
window reads the same hue as its selection card. One always-visible lamp (`g.lamp`, outside
`.details`) replaces the two green status lights Organic and Industrial used to gate behind the
detail cliff — lit by `calculateLampIntensity`, live audible-layer gain blended with detail,
floored at `LAMP_MIN`. `CLAUDE.md`'s Visual Mapping guardrail is amended to carve out exactly this
one non-audio exception: `identityColor` on the window glass and lamp, nothing else on the body
(`docs/ROBOT_DESIGN.md` "Identity layer").

### Not Doing (and why)

- **Reviving the parametric hull** — rejected by eye; `feature/robot-v2` stays unmerged, not to be revived.
- **Greebles** — computed live (`calculateGreebleCount`), still not drawn on any shape; Roadmap Phase 37 (Robot Greebles) owns rendering them.
- **`microVariants`** — unread by every shape; parked pending Phase 37, which may cover the one non-redundant case (fast attack → stripes) with a greeble part instead.
- **Layer markers / pod motion** — the always-present Coaxial/Harmonic sockets and any orbit/swim motion are their own later branches (Roadmap Phase 38 and beyond), not this one.
- **Identity colour anywhere else on the body** — the guardrail amendment is scoped to exactly two elements; widening it needs its own decision.
- **Changing `calculateScale`'s register steps** — the size fix is a floor clamp (`BODY_SCALE_MIN`), not a shift of the 0.7/1.0/1.3 steps themselves.

## 37. Robot Greebles

Second of the three-branch series on the existing four hand-drawn shapes (Roadmap Phase 36 →
**37** → 38). Idea [docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md), intent
[docs/intent/robot-greebles.md](../intent/robot-greebles.md), spec
[docs/specs/ROBOT_GREEBLES.md](../specs/ROBOT_GREEBLES.md), plan
[docs/tasks/ROBOT_GREEBLES.md](../tasks/ROBOT_GREEBLES.md), sketch
[docs/sketches/robot-greebles.html](../sketches/robot-greebles.html). **Implemented — all 9 tasks
on `feature/robot-rework`; Crawford's sketch sign-off and the perf + visual checkpoint both
passed.**

### About

Gives every robot a small, seeded, permanent set of hardware parts — panels, tanks, dishes,
antennas, decals — placed inside its own silhouette. `Robot.greebles` (`{ kind, slot }[]`) is
drawn once at spawn (`generateGreebles`, `spawnSystem.ts`): a count in `GREEBLE_COUNT_RANGE`
(2..5), then that many independent kind/slot draws with no robot ever repeating a slot. `kind`
indexes `RobotGreebles.tsx`'s fixed five-part vocabulary (`KIND_COUNT`, one or two SVG elements
each, coloured only from `colors.accent`/`colors.shadow` and the hardware greys); `slot` indexes
the current shape's `GREEBLE_SLOTS` table (`greebleSlots.ts`, `SLOT_COUNT` entries per shape,
hand-measured in the sketch to clear the window, lamp, vent and the two layer-socket positions
Roadmap Phase 38 reserves). `RobotBody` builds the node outside its audio memo and passes it to
the shape, which places it between the hull shadow and the window without ever learning about
kinds or slots — a waveform change re-slots the same parts onto the new outline instead of
regenerating them. `hideGreebles` omits it only on the 64px selection card; the detail avatar and
in-world robots always show parts. The five dead audio-driven greeble helpers
(`calculateGreebleCount`/`Size`/`Persistence`/`PlacementBias`, `calculateDetailLevel`) are deleted.
`CLAUDE.md`'s Visual Mapping guardrail gains a second non-audio layer alongside Phase 36's
`identityColor`: the seeded greeble set, confined to the vocabulary's own slots
(`docs/ROBOT_DESIGN.md` "Non-audio layers").

### Not Doing (and why)

- **Audio-driven greeble count/size/placement** — rejected in the intent interview: Crawford
  didn't want parts popping in/out; a seeded, permanent set reads as "natural and lore friendly".
- **Persistence/decay of individual parts** — there is nothing to decay; the set is permanent for
  the robot's lifetime.
- **More than two elements per kind, or more than `SLOT_COUNT` (8) slots per shape** — the Phase
  36 idle-paint lesson keeps element count bounded; the perf gate at Checkpoint C confirmed it.
- **Rendering parts on the 64px selection card** — `hideGreebles` keeps the card clean; only the
  detail avatar and in-world robots show them.
- **Layer markers / pod motion** — the two reserved socket positions this branch's sketch measures
  are Roadmap Phase 38's own fixtures, not drawn here.

## 38. Robot Layer Markers

Third of the three-branch series on the existing four hand-drawn shapes (Roadmap Phase 36 → 37 →
**38**). Idea [docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md), intent
[docs/intent/robot-layer-markers.md](../intent/robot-layer-markers.md), spec
[docs/specs/ROBOT_LAYER_MARKERS.md](../specs/ROBOT_LAYER_MARKERS.md), plan
[docs/tasks/ROBOT_LAYER_MARKERS.md](../tasks/ROBOT_LAYER_MARKERS.md). **Implemented — all 7 tasks
on `feature/robot-rework`; Crawford's Checkpoint B visual pass confirmed.**

### About

Gives every robot two always-present, identity-coloured sockets — Coaxial and Harmonic — lit in
proportion to that layer's live gain and dark when muted, so a robot's Signature Array edits
reach the body the same way lamp and greebles already do. `socketLitOpacity` (`gain`) in
`robotVisualHelpers.ts` maps gain 0 (or a missing layer) to `SOCKET_DARK`, interpolating up to
fully lit at `SOCKET_GAIN_MAX` (floored at `SOCKET_MIN` once any gain registers) — the same curve
shape as the lamp's `calculateLampIntensity`. `SOCKET_POSITIONS` (`greebleSlots.ts`) transcribes
the two per-shape centers the Phase 37 sketch already reserved at the tail of each shape's
`FIXTURE_BOXES`. `RobotLayerSockets.tsx` draws each socket as a housing ring (always visible, so a
dark socket reads as a fixture, not a hole) plus a glass/sheen pair whose group opacity carries
the gain-derived brightness; the four shapes take it as a `sockets` node placed after the lamp and
before `.details`. `RobotBody` derives `socketLit` from `layers[1]`/`layers[2]` inside its audio
memo, composes battery dim outside it exactly like the lamp, and wires the node into every render
context — card, detail, world. Nothing pops in or out on an edit; a muted layer just goes dark,
the same ruling the greebles got. `CLAUDE.md`'s Visual Mapping guardrail gains a third non-audio
carrier alongside the window glass and lamp: the two layer sockets, with the note that a socket's
lit state is still audio (gain) and only its hue is identity (`docs/ROBOT_DESIGN.md` "Non-audio
layers").

### Not Doing (and why)

- **Audio-driven socket count or position** — there are always exactly two, Coaxial and Harmonic,
  at fixed per-shape positions; nothing about count or placement is audio-derived.
- **A socket for the Baseline layer** — only the two optional layers (Coaxial, Harmonic) get a
  socket; Baseline is never quiet and has no socket of its own.
- **Detune or phase mapped to the sockets** — gain only for now; those wait for a motion branch.
- **Pod motion (orbits, trailing, lean)** — the static form of
  [layer-pods-and-follow-through.md](../ideas/layer-pods-and-follow-through.md); its own branch on
  top of this one.
- **Hiding sockets on the card** — both avatars show them, unlike greebles' `hideGreebles`
  carve-out.

## 39. Gem Polygon Robots (Branch A)

Replaces the robot series above (Phases 36–38) rather than extending it: the four hand-drawn
shapes, their greebles and layer sockets are gone. Idea
[docs/ideas/gem-polygon-robots.md](../ideas/gem-polygon-robots.md), intent
[docs/intent/gem-polygon-robots.md](../intent/gem-polygon-robots.md), spec
[docs/specs/GEM_POLYGON_ROBOTS.md](../specs/GEM_POLYGON_ROBOTS.md), plan
[docs/tasks/GEM_POLYGON_ROBOTS.md](../tasks/GEM_POLYGON_ROBOTS.md), sketch
[docs/sketches/gem-polygon-robots.html](../sketches/gem-polygon-robots.html). **Implemented on
`back-to-gen-robots`: Gate 1 (sketch) and Gate 2 (live, by eye) passed; Task 9's perf gate closed
on an accepted residual (below).** Requested by Crawford 2026-10-04: the old robots didn't match the
console, blurred together and felt lifeless.

### About

A robot is a seeded stack of low-poly gem polygons — a near-black backing, four 24 × 16 orbiters in
the corners, two Mids hanging off the centre line and a Top polygon with two lights — each a
chamfered rectangle on a 15° grid with a bevel ring lit by one world light. Geometry is derived from
`Robot.gemSeed` by `getRobotGem` and never stored. The guardrail is inverted: `identityColor` is
the body; audio reaches it only through three continuous dials (lights, each Mid's lit level from
its layer's gain, body scale), so nothing pops on an edit. Card and avatar fit each robot to its
tile at scale 1 (`gemViewBox` + `ignoreScale`). See docs/ROBOT_DESIGN.md.

**Decisions made while building** (all recorded in spec and plan): geometry derived from the seed,
never stored; Mid z-order follows the outline (the spec draft had it reversed); generator fixes the
sketch lacked (double-chamfer 15° drift, bevel bow-ties via `bevelHolds`, line clearance); card
framing "fit each robot"; facets merged into one path per tone and quantized to 3 tones
(`GEM_FACET_TONES`) after the idle-paint gate — busy +6 % / paint +34 % over the hand-drawn robots,
down from +14 % / +94 %, the residual accepted by Crawford (docs/PERFORMANCE.md). The three
`robot.greeble.*` dataIds are retired, not renamed — a breaking change to world generation, accepted.

### Not Doing (and why)

- **Audio → geometry, bevel or Mid hue** — Branch B (signal chain) in the idea one-pager.
- **Orbiter motion, wobble and enter/leave** — Branch C (motion); absorbs the pods idea. Shipped,
  redesigned, as Phase 40 below — not the wobble/orbit form this bullet originally named.
- **Waveform as an angle dialect** — held from the Gate 1 sketch; no evidence yet it reads at 1×.
- **Closing the last +6 % idle cost** — accepted; the residual is paint per element.

## 40. Orbiting Polygons

Idea [docs/ideas/gem-polygon-robots.md](../ideas/gem-polygon-robots.md) (Branch C, superseded),
intent [docs/intent/orbiting-polygons.md](../intent/orbiting-polygons.md), spec
[docs/specs/ORBITING_POLYGONS.md](../specs/ORBITING_POLYGONS.md), plan
[docs/tasks/ORBITING_POLYGONS.md](../tasks/ORBITING_POLYGONS.md), sketch
[docs/sketches/gem-polygon-robots.html](../sketches/gem-polygon-robots.html) (Motion panel).
**Shipped on `feature/orbiting-polygons`, redesigned mid-build.**

### About

Phase 39's four orbiters stop sitting static at the canvas corners: they now attach to the hull.
Composition settings (density → count, Phrase Length → size, Note Variance → boundary-line width,
Pitch Repeat → a new emissive centre strip) drive the same four dials the original plan specified.
Where the plan diverges is motion — the original design had orbiters drift near their corners and
periodically ride a paired hoop through the body, entering and leaving by that ring. Gate 1 (the
motion sketch) passed with that design and Task 13's idle-paint gate found it busy +63 % over the
Phase 39 baseline, driven by the standing per-pair orbit-scheduler construct count (not drift, not
orbit frequency — both were ablated and ruled out; see docs/PERFORMANCE.md). Crawford cut the whole
orbit/drift mechanism rather than chase the perf gate further: orbiters now dock at Top's four
corners, nestled between Mid and Top, and sit rigid with the body once attached. On spawn —
including a robot's own first mount — each attaches with a short hop (dropped, shrunk, faded, then
`back.out` into place); a count decrease plays the hop in reverse. Job animations (detach to do
"work") are an explicit later phase, not this one.

### Decisions made while building

- **Dock position:** four distinct slots at Top's corners (not one shared cluster), so
  `cornerOrder`/count/the dial mapping stay meaningful — Crawford's call when the redesign was
  interviewed.
- **Despawn before job animations exist:** mirrors the attach hop in reverse (fly out, then hide) —
  keeps the existing one-arc-at-a-time queue (Task 10 of the plan) symmetric without needing to
  invent "work" animations early.
- **Depth twins removed:** the original plan's three copies per orbiter (behind/rest/front, for
  passing in front of/behind the body mid-orbit) collapsed to one copy per corner — nothing passes
  through the body any more, so the DOM z-order (orbiters drawn between Mid and Top) does all the
  "nestled" work the twins used to.
- **A code-review pass before committing** (CLAUDE.md's `code-review-and-quality` skill) found and
  fixed three things: a race where the initial-mount attach batch (deliberately ungated, so every
  orbiter pops in at once) wasn't tracked by the one-arc-at-a-time guard, letting a rapid count
  change start a detach hop fighting an in-flight attach tween; a standing-but-always-empty
  `gsap.timeline()` per robot per context, swapped for a lightweight stub; and `gemMotionViewBox`
  not padding for the `size` dial's maximum, which the old hoop-based viewBox's generous padding
  had been masking by accident.
- **Flip removal** (§1.6 of the spec, its own task): robots no longer mirror on direction change —
  unrelated to the motion redesign, landed alongside it.

### Not Doing (and why)

- **Drift and the ring/hoop orbit** — built, gated past Gate 1, measured at the perf gate, then cut
  entirely per Crawford's redesign call; not a residual to revisit, a replaced design.
- **Job animations (detach to do "work")** — explicitly the next phase on this feature, not scoped
  here; `useOrbiterMotion.ts` stays ignorant of what a later detach will mean. Now
  [Phase 43](#43-robot-jobs-and-charging-stations).
- **LFO → orbiter links** — dropped for good at the intent stage (orbiter motion is composition-
  driven, never LFO-driven).
- **Top/Mid oscillator-driven rules** — a separate later pass, per the intent doc.

## 41. Robot Halo and Lit Lines

Intent [docs/intent/robot-halo-and-lit-lines.md](../intent/robot-halo-and-lit-lines.md), spec
[docs/specs/ROBOT_HALO_AND_LIT_LINES.md](../specs/ROBOT_HALO_AND_LIT_LINES.md), plan
[docs/tasks/ROBOT_HALO_AND_LIT_LINES.md](../tasks/ROBOT_HALO_AND_LIT_LINES.md), sketch
[docs/sketches/robot-halo-and-lit-lines.html](../sketches/robot-halo-and-lit-lines.html).
**Merged to main (PR #528, `feature/mystery-light`), Tasks 1–13.** The halo ripple's first
caller is [Phase 43](#43-robot-jobs-and-charging-stations)'s station enter/exit arcs (J2,
2026-10-08).

### About

Crawford's "mysterious light" pass, the Top/Mid pass Phase 40 reserved. Each gem robot gains a
company-coloured halo behind its Mids (shaped by envelope, sized by volume), lit strips on the Top
and Mid boundary lines widened by that layer's gain-LFO depth, and a two-second out-of-step flicker
on any strip whose driving attribute changes. The strips and flicker are live everywhere.

### Decisions made while building

- **The halo ripple is not tied to the orbiter hop.** Wiring `decorateArc` into Phase 40's
  attach/detach hop was tried and reverted the same day (2026-10-06): that hop is density-driven,
  not a real spawn/despawn event. The halo exists, fully inert, reserved for a job-detach or
  docking animation — [Phase 43](#43-robot-jobs-and-charging-stations)'s station enter/exit is its
  first planned caller. See the spec's §1 Amendments.

### Not Doing (and why)

- **The halo/ripple visual gate** — deferred, per the spec's §5 gate note, to whichever task first
  wires `decorateArc`; that task re-runs the gate's original wording (and the idle-paint check).

## 42. World View Districts

Intent [docs/intent/world-view-districts.md](../intent/world-view-districts.md), spec
[docs/specs/WORLD_VIEW_DISTRICTS.md](../specs/WORLD_VIEW_DISTRICTS.md), plan
[docs/tasks/WORLD_VIEW_DISTRICTS.md](../tasks/WORLD_VIEW_DISTRICTS.md), sketch
[docs/sketches/world-view-districts.html](../sketches/world-view-districts.html). **D1 shipped on
`feature/world-districts`; D2 (the scenery families) shipped on `feature/world-scenery`; D3
(atmosphere) shipped on `feature/world-atmosphere` — all three branch tips, 2026-10-07.**

### About

Every locale becomes a seeded underwater district: one of nine row recipes replaces the single fixed
`FACTORY_ROWS` table, drawn over a seabed ridge, a stepped ground line and a water column that
follows the hour, populated by static scenery families that obey the factory rules. Three branches:
**D1** districts + terrain + water, **D2** the families, **D3** atmosphere. Changing what existing
coordinates and saved `?session=` links show is accepted.

### Not Doing

- **Coast framing** — the sketch kept it for comparison only; the world is underwater, full stop.
- **The legacy `FACTORY_ROWS` table as a tenth district** — dropped; one in ten worlds looking like
  today defeats the point of districts.
- **Preserving existing worlds / saved `?session=` links** — accepted breaking change (intent
  "Out of scope"); regenerating a different-looking locale at the same coordinates is the point.
- **Audio → world mapping** (global audio parameters driving the recipe pick, derelict ratio or
  lighting) — a separate session; the recipe pick and derelict ratio stay explicit per-locale values
  so that future session has clean targets.
- **Robot visuals** — untouched; Phase 40/41 own them on their own branches.

### Decisions made after the spec

- **The `dock` pad family is dropped (2026-10-06)** — [Phase 43](#43-robot-jobs-and-charging-stations)'s
  charging stations replace it; 16 scenery families, not 17.
- **Phase 43 reuses `deriveSceneryParams(actor)`** (already a pure module in the plan, Task 11) for
  its `workAnchors(actor)` and headless readiness sim — so renderers must keep reading geometry from
  it, never deriving sizes inline. Phase 43 also reads `config.derelict` and the row's `offscreen`
  anchor (via `config.row` + the district) to decide which items can host jobs.
- **D1 + D2 block Phase 43** — its building-to-job host lists are written against the district
  families. D3 does not.
- **`MarineSnow` is cut (2026-10-07)** — built, judged live by Crawford, and dropped: it read as
  film grain over the scene rather than drifting particulate, making the already-static world look
  stiller, not more alive. Three motion variants were perf-measured as a follow-up and none
  changed the verdict. `LightShafts` ships alone as D3's atmosphere layer. See
  docs/specs/WORLD_VIEW_DISTRICTS.md's 2026-10-07 amendment and docs/tasks/WORLD_VIEW_DISTRICTS.md
  Task 21.
- **D3's perf gate pinned an hour, not a district** — `computeLocaleHour` reads `abs(x % 24)` off
  `dayStartTimestamp` at locale build time, so Task 22 picked `x = 12` (shafts on) and `x = 0`
  (shafts off) directly rather than scanning for a district; passed within the existing noise band
  at both hours (docs/PERFORMANCE.md).

## 43. Robot Jobs and Charging Stations

Idea [docs/ideas/robot-jobs-and-stations.md](../ideas/robot-jobs-and-stations.md), intent
[docs/intent/robot-jobs-and-stations.md](../intent/robot-jobs-and-stations.md), spec
[docs/specs/ROBOT_JOBS_AND_STATIONS.md](../specs/ROBOT_JOBS_AND_STATIONS.md), plan
[docs/tasks/ROBOT_JOBS_AND_STATIONS.md](../tasks/ROBOT_JOBS_AND_STATIONS.md). **Shipped: all four
branches merged to main, 2026-10-07 to 2026-10-08.**

| Branch | PR | Tip merged | Tasks |
|---|---|---|---|
| J1 lifecycle + world data, `feature/jobs-lifecycle` | #537 | `cd7f9988` | 1–16 |
| J2 stations + the loop, `feature/job-lifecycle-2` | #538 | `af560c36` | 0a, 0b, 16b, 17–27 |
| J3 the move set, `feature/jobs-moves` | #539 | `9f7cda8e` | 28–30 |
| J3 docs, `features/jobs-phase-4` | #543 | `8535afd8` | 31 |
| J4 depth layers, `feature/jobs-depth` | #544 | `c1ad9837` | 32, 32b, 33, 34, 34b, 35 |
| Final docs, `docs/jobs-final` | — | — | 36 |

**J2 (stations + the loop) shipped and merged 2026-10-08:** Crawford's two motion sketches; the
work loop (`workLoop.ts`) behind the `onLifecycleChange` seam, with the legacy adapter, idle
wandering and job affinity scoring deleted; Crawford's charging station design (three fragments
around the robots, slot lights, live rig dials, the station ripple); recall and turn-back; jobs
6–10 s from the tempo; site cooldown 0.3/2/30; and the activity on the robot cards. **J3 (the move
set) shipped and merged 2026-10-08:** all five moves (`hoverPulse`, `trace`, `ring`, `fan`,
`carry`), the six-job table and per-robot variation. **J4 (depth layers) shipped and merged
2026-10-08:** a second moving robot row (`robots-back`) behind the midground, so background
buildings host work (`BACK_HOSTS_ENABLED` true); robots switch rows only at the start of a run
clear of every midground silhouette, under a 1 s dissolve, at 0.75 scale in the back; four depth
tints replace the old two; exiting robots leave between the station's back plate and the rest.
Checkpoints A–E all passed live. Every perf gate passed except J4's, whose paint miss (+31 ms per
6 s, the two extra compositor layers) Crawford accepted after a Pixel run on the Full Load
Budget; the J2/J3 Pixel listen passed too (docs/PERFORMANCE.md). Docs:
[ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md), [ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md),
[BUILDING_DESIGN.md](../BUILDING_DESIGN.md), [ROBOT_DESIGN.md](../ROBOT_DESIGN.md).

J1 shipped:
- the renamed docking states;
- the flat drain (6), with the job out of the replay;
- the `onLifecycleChange` seam with a legacy adapter (today's visuals, unchanged on screen);
- host lists, work sites and the coverage top-ups (the only visible change, in 5 districts);
- seeded stations, site choice, and the drain and readiness sims (site cooldown 0.4/3/30).

Checkpoint B's static checks and idle-perf gate passed (busy −1.5 % vs main, docs/PERFORMANCE.md).
Depends on
[42](#42-world-view-districts) (D1 + D2, for the host buildings), [40](#40-orbiting-polygons) (the
orbiters that do the work), [41](#41-robot-halo-and-lit-lines) (the halo ripple on station
enter/exit) and [20.5](#205-world-clock-deterministic-lifecycle-replay) (the replay this phase
narrows).

### About

Robots stop wandering at random and do work their world asks for. Host buildings carry job lists;
a building is ready when no robot holds it and its cooldown has elapsed, and a robot finishing a job
(or leaving a station) goes to the nearest ready building for its job — or switches to a job no
other robot holds when none is ready. At the building the robot bobs while its orbiters detach and
play the job's moves (`hover-pulse`, `trace`, `ring`, `carry`, `fan`) at the building's work anchors,
for 6–10 s set by the tempo (orbiter count was cut from timing at the moves sketch). Low battery sends it, once the current job finishes, into one of 2–3
seeded floating gem stations (capacity 6, slot lights), where it is invisible while charging. A
second moving robot layer behind the midground lets background buildings host work.

Battery stays on the measure tick at one flat drain rate, so the job leaves the World Clock replay;
battery, docking and pitch drift still replay exactly. Animation runs on wall-clock time and never
touches the music. Six jobs: the existing four plus Salvage and Maintenance. Full direction,
assumptions to validate, MVP and Not Doing list are in the idea doc.

### Supersedes

- Backlog item 8 (Visuals: Job Animations), closed by this phase and moved to
  [docs/todo/archive/backlog-archive.md](archive/backlog-archive.md).
- The bottom-only entry/exit, random idle wandering and low-battery lower-third rules
  ([docs/ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md)), job affinity scoring and per-job battery
  surcharges — all removed by this phase, along with the dead `interactionSystem.ts` and factory
  production fields. J1 removed the surcharges, `interactionSystem.ts` and the production fields;
  J2 removed the rest when the work loop replaced the legacy adapter (Task 24).

### Decisions made while building

All Crawford's unless marked; each is recorded in the plan's "As shipped" notes.

- **Orbiter count no longer drives job speed** (moves sketch, 2026-10-07): every job lasts 6–10 s,
  set by the tempo at job start. Count only decides how many orbiters work.
- **The station is his own design** (station sketch): four rotated gem layers drawn as three
  fragments around the robots, a 25-shape budget (raised from 16), slot lights in the stored
  robots' identity colours, no bob, geometry driven by the global rig.
- **Flat drain 6 and site cooldown 0.3/2/30**, both picked from headless sims.
- **Midground silhouettes are everything solid between the robot rows** ("let's not let robots
  clip through anything"), with bubbles, plumes and floodlight beams left out.
- **Tints and a dissolve together** (depth-tint sketch gate): A .06 / B .25 / C .20 / D .10, so a
  row switch moves 40 % haze instead of 85 %, blended by a 1 s dissolve.
- **The front copy fades in both directions** (Task 34, the agent's call against the plan's
  wording): a back → front robot re-mounts in front only after its fade, so the haze never pops.
- **J4's paint cost accepted** (Task 35): +17 % paint at idle and ≈ +17 MB on a Pixel 8, for the
  two extra compositor layers, after a 3-minute Pixel run on Full.

### Not Doing (and why)

- **Time of day in job choice**: the hour is wall-clock and measures follow tempo, so they can't
  share a replay.
- **Per-job or per-orbiter battery drain**: jobs change at wall-clock moments; a flat drain keeps
  the replay exact.
- **Jobs from audio controls or companies**: audio drives the look; companies already make their
  members look alike.
- **Lifecycle light colours** (low-power red, charging yellow): no change to the Visual Mapping
  guardrail.
- **Visible building calls and a colony economy**: timers, static-layer repaints and unreplayable
  state.
- **Job animations on cards or the detail avatar**: the avatar keeps its orbiters attached.
- **Persisting or replaying job, activity, position, row or cooldowns**: a live layer by design.
- **Power-cycle polish**: its own pass; a power cycle still kills the work, swim and station
  animations.
- **One robot row with midground clipping**: J4's alternative if the re-mount had hitched; it
  didn't (Checkpoint E).
- **The districts' `dock` pad family**: dropped; stations replace it.

### Still open

- **Background parks below the roof** (spec §7 Q6): 10 of 1 523 background sites over the
  121-seed grid park low; drop them or park beside them is Crawford's call
  ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md#known-gaps)).

## 44. World Gem Material (Option A)

Idea [docs/ideas/world-gem-material.md](../ideas/world-gem-material.md), intent
[docs/intent/world-gem-material.md](../intent/world-gem-material.md), spec
[docs/specs/WORLD_GEM_MATERIAL.md](../specs/WORLD_GEM_MATERIAL.md), plan
[docs/tasks/WORLD_GEM_MATERIAL.md](../tasks/WORLD_GEM_MATERIAL.md), sketch
[docs/sketches/gem-factories.html](../sketches/gem-factories.html) (merged, PR #540; sketch gate passed
2026-10-08 — Crawford: "a great little blend of both art styles"). **Built on `feature/world-gem`,
2026-10-08 to 2026-10-09 (Tasks 1–19, 21 and 22); not yet merged.** The idle-paint perf gate (Task 19)
passed on all three pinned worlds with no cut — docs/PERFORMANCE.md, "World Gem Material — the Task 19
perf gate". **Still owed: Task 20** — Crawford's by-eye look at the live 1920 × 1080 world at 9 am, noon,
3 pm and 10 pm, and the Pixel listen — then the PR.

### About

The gem robots (Phase 39) and the world they sit in read as "one style randomly placed on another"
(Crawford, 2026-10-08). Option A closes the gap by material, not form. The rule for what gets what:
**mass gets the robots' bevel ring, everything else solid gets a 1.5 px hairline.**

- **Mass** — factories and their rooftop blocks, tanks, walls, dome bases, containers, scaffold blocks,
  wreck hulls, deckhouses and funnels, vent steps, crane loads, and the terrain's ridge and ground
  profiles — gets an 8 px inset outline (× the item's own scale, through the robots' one 18 % short-side
  cap, and no ring under 1 px), one trapezoid facet per edge, and three quantized tones (`quantizeShade`
  from `gemShading.ts`, the 0.5 / 1.1 / 1.25 multipliers from `gemShape.tsx`). Rooftop blocks use 0.6 ×
  the building's depth. There is no outline stroke on mass.
- **Everything else solid** — members (posts, beams, masts, pylon towers, scaffold frames), curves (the
  dome cap's arc, the dish reflector, the turbine hub) and the six families the world scene left out
  (dish, turbine, floodlight, tether, pipeline, the pipe bridges) — gets the hairline, in the scenery
  gem outline's colour. Thin rooftop parts and the cupola's arc get it too.
- **Left alone:** silhouettes, windows (re-centred inside the ring), belts, lamps, greebles' placement,
  boulders, beacon heads, pylon heads and the charging stations.

Three rulings were made after the idea doc and supersede it (the intent's "Supersedes the idea doc"):
members get the hairline instead of nothing; the terrain is in (its switch survives only as a code
constant for the A/B); and everything else solid gets the hairline too. The other rulings stand: **the
hour-driven east/west sun wins** on buildings (`worldLightVector`; the robots keep their own fixed
top-left light), **the windows stay**, bevel 8 px, facet contrast 1.0, lateral sun 1.0, no boundary
lines. A bevel of 0 renders as today's renderer did; the six `WORLD_GEM` switches in
`material/worldGemMaterial.ts` are code constants, no setting and no UI.

Built differently from the spec, found while building: the terrain's 8 px bevel does not hold on the
polygon as drawn (a miter that deep inverts on most seeded worlds), so its ring is built on an extended
outline (`terrainRingOutline`); at 9 am only east-facing steps and flat runs are lit, west-facing steps
are neutral; the crane hanger is a `<rect>` now whatever the switches; and `midgroundSilhouettes.ts`
widens the bridge boxes by half a hairline. Docs: BUILDING_DESIGN.md ("World Gem Material", "World gem
treatment"), ROBOT_DESIGN.md ("Bevel and shading"), PERFORMANCE.md, and the executable pin in
`src/docs/worldGemMaterialDocs.test.ts`.

Perf: static-layer content only, repainted on the once-a-second lighting tick, never per frame. The
Task 19 gate (2026-10-09) ran `main` `6802c8b4` against the branch on `dense`, `ventfield` and `yard`,
three rounds each: median main-thread busy +2.1 % / +1.7 % / +0.4 % and Paint +6.6 % / +0.5 % / −2.4 %,
every delta inside `main`'s own round-to-round spread; one ablation round with the hairlines off and the
terrain off separated from nothing. No cut was taken; the Pixel is Task 20's. No CSS transition on any
facet fill (the 17.2.5 rule). Depends on [42](#42-world-view-districts) (the families) and
[39](#39-gem-polygon-robots-branch-a) (the material).

### Supersedes

- [docs/todo/backlog.md](backlog.md) item 9 (Visuals: Better Building Details) — the material pass is
  the building-detail work; any greeble-variety follow-up is a later, separate item. Item 9 has moved to
  [docs/todo/archive/backlog-archive.md](archive/backlog-archive.md).

### Not Doing (and why)

- **Option B (chamfered silhouettes) and Option C (buildings as stacked gem parts)** — Crawford asked
  for A only; both change the silhouette-first pillar (BUILDING_DESIGN.md) and the greeble, clip and
  ground-lock geometry written against the universal rectangle. Re-decide after A ships, if at all.
- **The robots' fixed top-left light on buildings** — ruled out; the east/west sun is the world's
  only sunlight.
- **Replacing windows with emissive vertex lights** — ruled out; the windows stay.
- **A ring on members or curves** — they get the hairline, never a ring; arcs are never faceted (the
  90/45 grid rule).
- **A union ring on the vent cone** — its ledges are narrower than the bevel, so the ring
  self-intersects; each step is ringed as its own block instead.

## 45. Layout Rework (shell, nav, section tabs, roster, off screen)

Intent [docs/intent/layout-rework.md](../intent/layout-rework.md) (confirmed via `interview-me`,
2026-10-09), spec [docs/specs/LAYOUT_REWORK.md](../specs/LAYOUT_REWORK.md), plan
[docs/tasks/LAYOUT_REWORK.md](../tasks/LAYOUT_REWORK.md), sketch
[docs/sketches/layout-rework.html](../sketches/layout-rework.html) (every view tab approved; its header
is the record of the design, no longer the plan). Docs: [UI_SHELL.md](../UI_SHELL.md),
[COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md), [COMPANIES.md](../COMPANIES.md),
[SESSION_STORAGE.md](../SESSION_STORAGE.md). **Built on `feature/layout-rework`, 2026-10-09 to
2026-10-11 (Tasks 1–32); not yet merged.** The idle-paint gate (Task 29) passed after one fix —
docs/PERFORMANCE.md, "Layout Rework — the Task 29 perf gate". Task 30 (Crawford's screenshot check) was
signed off on 2026-10-11. **Still owed: the Pixel listen** — then the PR.

### About

Crawford's twelve desktop and six phone screenshots (2026-10-08) named the problems: the off screen says
nothing about what the switch does; the header and the permanently docked nav crowd every screen; the world
shows through a 75 % glass under every control; the same information is stated three times per screen (nav
tree depth, accordion headers, two intro panels); every radio option is a two-line cabinet box; the Probes
list is twelve identical cards that are mostly company radios; and on phones the fixed header hides scrolled
content. The shell and every screen were rebuilt to the sketch. Nothing below the UI changed: the session
payload, the share link and the audio path are untouched.

- **One shell switch.** `useShell()` (768 px) is the only desk/phone branch; `useCabinetTier` keeps sizing
  controls. The phone shell holds down to 320 px.
- **One nav panel, five boxes** (Deck, Fleet Params, Probes, Companies, Settings) that expands in place for
  Probes and Companies, all selection through `navActions.ts`; on the phone the same panel is a sheet opened
  from a bottom bar. The tree, the stacked accordion screens, scrollspy and `accordionSync` are deleted.
- **An opaque content surface** over the dimmed world, a slim header (mute and volume), and a meta box on the
  Deck carrying the world line and the selected robot's and company's lines; selected robots and company
  members get a halo in their own and the company's colour.
- **Section tabs** (`SectionTabs`, one section in the DOM at a time) on Fleet Params, the robot screen, the
  company screen and Settings; a "?" help popover on every value control (`ContentEntry.help`); single-line
  `RadioButton` faces; a compact `LfoLink`.
- **The roster board** replaces the Probes list and the Companies index: a row per company then Freelance,
  tiles with a quiet Move chip (popover on the desk, sheet on the phone) and a `Flip` glide. **The company
  screen** is the robot screen with a company column, edited through `useCompanyOptions`.
- **An off screen** that explains the power switch, over the world built before power-on (`initializeLocale`
  split into build and start halves) and a Transmission picker of three preset worlds and the user's saves.

### Decisions made while building

- Picking a parent box goes to that branch's page and a pick collapses the list (Crawford, 2026-10-09 and
  2026-10-10); the panel's rest and wide widths are 124 and 200 px. Deleting a company selects All Probes.
- The phone's breadcrumb drops Root; the narrow desk (768–1000 px) was left as it is, and the top bar's empty
  space left of the rocker is flagged for a later pass.
- Option lore is back on the `RadioButton` face as a second line (not a popover), and every intro is a
  collapsed More / Less expander with its headline showing, stacked on the phone.
- The Freelance row is always present, even empty; a robot with an orphan `companyId` reads as Freelance.
- The three presets (Kryndara, Vessport Null, Halcyon Drift) and the off-screen copy are placeholders
  until Crawford curates them.
- **A bug older than this branch, found by the perf gate:** `useHaloMotion` started a 0.5 s tween on every
  re-render because `RobotBody` hands it a fresh object each time, so every halo wrote its attributes on every
  frame (about 2,250 stop writes a second, on `main` too). Fixed in `153c2956`; the powered-off world went from
  ~350 paints in 6 s to ~26, and the powered-on Deck's idle main-thread time fell about 32 %.
- A known-flaky company-name test was removed on Crawford's word (`6d743603`).

### Supersedes

- [docs/todo/backlog.md](backlog.md) item 2 (Onload: Power-Off Intro Text) — the off screen's label, power
  hint and Transmission row. Item 4 (Helper Text on Inputs) — `ContentEntry.help` and `HelpPopover`. Both
  moved to [docs/todo/archive/backlog-archive.md](archive/backlog-archive.md).

### Open

- The meta box's selection lines were deleted after the code review (2026-10-11): every selection opens a branch
  and `goHome` clears both ids, so the Deck never has a selection. The halo stays; bring the lines back from git
  history (commit before this note) if a surface ever shows them.
- Compositor::Update is about 15–20 % higher on Fleet Params than on `main` (not a gate metric, not
  investigated).
- The Move sheet's 500 ms tap-hold was not tested on a touch device.

### Not Doing (and why)

- **The theme engine and the Theme row** — [docs/ideas/themes.md](../ideas/themes.md) is its own phase, with
  its own interview; the sketch keeps the row behind an option under the same no-pop rule.
- **The Atlas card, sleeve transport keys, a desk, any hardware key** beyond the power rocker — parked for
  v2 (`punch-card-session.html`); soft keys were sketched and rejected.
- **Drag between roster groups** — needs a keyboard fallback and is bad in a scrolling board on phones; the
  Move chip is the reassignment.
- **A per-field "own versus inherited" marker on the company screen**, **a roster filter**, **any gem
  material on UI chrome or controls** (tried in `gem-controls.html`, rejected), and **option B** and the other
  nav and roster cuts the sketch tried.
- **Changes to the payload, the share link, the audio path or the Audio Load Budget.**

## 46. Mobile Deck Camera (the world crop on phones)

Raised by Crawford, 2026-10-09, during the districts brainstorm on `feature/layout-rework`. **Built
2026-10-11 on `feature/deck-camera`** in two passes: first the fit, the native scroller and an
idle-cut camera ([intent](../intent/mobile-deck-camera.md)), then that camera's trigger model
replaced by a continuous follow loop ([intent](../intent/deck-camera-follow.md),
[spec](../specs/DECK_CAMERA_FOLLOW.md), [plan](../tasks/DECK_CAMERA_FOLLOW.md)). The code is
`src/animation/deckCamera.ts`; how it works is in
[docs/ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md) ("Deck camera").

### What was built

The world view is a native horizontal scroller over the unchanged 1920 × 1080 stage (move the
window, don't shrink the stage), and the camera always has a subject. It **picks** a robot (lowest
battery among those above 50 %, else the lowest overall), floats to it, **follows** it for up to
20 s or until it docks, rests for an 8 s **cooldown**, then picks again. Two things interrupt it:
the user's touch, and backing out of a robot's or company's screen to the Deck, which floats
straight to that robot (or a member of that company). Tap-to-pan and the idle-cut model are gone.

### About

The scene is a fixed 1920 × 1080 stage drawn with `preserveAspectRatio="xMidYMid slice"` (cover) in
`OceanScene.tsx`'s `SceneLayer`, and `WorldView.css` clips the overflow ("nothing ever needs to
scroll"). On a portrait phone that scales the world to the deck's height and crops the sides — on the
sketch's 375 × 812 phone, with roughly 740 px of deck, the user sees about 28 % of the world's width.
Crawford: "users miss a LOT."

Measured against that phone (robot size is the gem body at the scene scale, approximate):

| Fit | World height | Visible width | Robot |
|---|---|---|---|
| Today, cover | 740 px | 28 % | about 40 px |
| 16:9 contain (letterbox) | 211 px | 100 % | about 12 px |
| 2 × screen width, panned | 422 px | 50 % | about 23 px |

A 16:9 letterbox (Crawford's first thought) shows everything but puts robots under tap size and
loses the gem facets, lit lines and halos; it is the right fit for landscape phones and tablets and
the wrong one for a portrait phone. Recommendation (2026-10-09): **move the window, don't shrink the
stage.**

1. **Pan.** Keep the cover fit and make the world view a native horizontal scroller with scroll
   snap. Compositor-driven, no per-frame JavaScript, no new scene layer; momentum and tap-vs-swipe
   come free. The "nothing scrolls" line in `WorldView.css` describes today's layout, it is not a
   guardrail. The six stacked layers scroll as one container, so scene-to-pixel mapping is unchanged.
2. **Drift and a camera.** Proposed then as an optional GSAP drift, and a later camera that follows
   the selected robot or cuts to work sites on the work loop's semantic triggers. Both were
   superseded by the follow loop (see "What was built").
3. **Overview, if wanted:** a schematic minimap (terrain profile line, building dots, the viewport
   rectangle), static per world — never a second render of the scene, which would double the DOM.
   Robots as moving dots on it would be a moving layer and a separate perf-gated decision.

Also on the table for the letterbox band, if the 16:9 fit is chosen anyway: the small phone avatar
band the Robot screen already approved (tap to select, the camera pans to the robot), the meta box
grown into a telemetry strip, a 24-hour clock, or nothing (a monitor letterbox is on-brand for the
sleeve). The neighbourhood map is backlog [25](backlog.md#25-neighbourhood-map-coherent-districts-and-the-visited-log).

The recommendation above is the 2026-10-09 brainstorm, kept as the record of why the fit is a
scroller. Only its first step shipped as written.

### Not Doing (and why)

- **A portrait world (re-placing recipes for a tall `WORLD_BOUNDS`)** — the same coordinates would
  show a different place on a phone than on a desktop, which defeats the share link and the
  "coordinates are the place" promise. The stage stays 1920 × 1080 everywhere.
- **Rendering the scene twice (overview + zoom)** — doubles the static DOM; the 17.2.5 and Phase 42
  gates were passed on one scene.
- **Tap-to-pan or any manual "jump to this robot" control** — the camera chooses; the user's only
  levers are touch (freeze) and backing out of an edit screen.

### Decisions made after the spec

- **An empty pool restarts the cooldown (2026-10-11).** When every candidate is docked, `pick`
  returns `null` and restarts the cooldown, so the camera retries after a full 8 s rather than every
  frame.
- **The wheel is an instant touch and release (assumption 8, spec Q1).** A wheel tick freezes the
  camera and starts the cooldown in the same breath. Inferred from the touch/release rule, not stated
  in the interview for the desktop case; revisit only if a mouse-wheel user finds the camera
  re-picks too eagerly.
- **The tie-break is the viewport centre (assumption 3, spec Q2).** Equal batteries go to the robot
  whose target is nearest the scroller's current viewport centre, not the just-ended subject's last
  position; the two agree whenever `pick` runs after the camera has settled.
- **The float is `power1.inOut` over 1.4 s, not the spec's 0.8 s (Crawford, manual check).** Shorter
  or sharper read as a snap on the stage's width.

### Gate results

- **Idle paint (Task 10, 6 s window): missed, accepted.** Busy +23 % (1265 → 1551 ms median) against
  `main`, outside the round-to-round spread; Paint held and a 30 s tracking round showed no gap, so
  the cause is unexplained (docs/PERFORMANCE.md, "Deck Camera Follow — the Task 10 perf gate").
- **Pixel underruns (Task 11): not measured, signed off.** No `?debug` A/B counts were captured;
  Crawford reported the phone running great and signed off the walk (docs/PERFORMANCE.md, "Deck
  Camera Follow — the Task 11 Pixel check").

## 48. One Day Clock: Remove the Measure-Based Day

Raised by Crawford, 2026-10-09, on `feature/layout-rework` ("should we have two clocks like this? It
often feels like it adds some complexity … I don't want bpm making days only take 30 seconds").
Decided the same day: **replayability is the top priority**, so the fleet lifecycle, the harmony
palette and the swells stay on measures and the World Clock replay
([20.5](#205-world-clock-deterministic-lifecycle-replay)) is untouched; the in-world day is the wall
clock, a fixed `DAY_DURATION_MS` (6 real minutes) from each locale's own `dayStartTimestamp`, never
tempo. The two clocks stay because they count different things. What goes is every line of code and
doc that still claims measures make a day — all of it dead or wrong today, verified against the code
2026-10-09 (inventory below). Widened the same day at Crawford's word ("add the rest to item 48") to the same class
elsewhere — a spot check found a dozen more exports, fields and dials nothing turns (items 7–10). A
cleanup, not a feature: no visual change, no audio change, no payload
change, no new dependency. It amends a CLAUDE.md Guardrail, which this decision authorises.
Independent of the layout rework (it touches the lighting components, the beat clock and
`AudioEngine`, none of which the rework edits); its own short branch off `main`, a task list rather
than a full spec.

> **Shipped (2026-10-13), `fix/unused-clock-code`, twelve code commits and one docs commit, TDD, one per task.** T1 `getLighting(hour)`
> (a golden table pinned from the measure form) and the five callers; T2 the flicker epoch in hours
> (`FLICKER_PERIOD` 2, `flickerPhase`, `getFlickerEpoch`, the same eight quarter-hour slots, so the epochs are
> unchanged); T3 the beat clock (`getCurrentHour`, `MEASURES_PER_HOUR` and the wrap gone; listeners get the real
> measure); T4 `Locale.currentMeasure`; T5 `DAY_CYCLE_MEASURES`; T6 the four `uiStore` dials; T7 `Robot.createdAt`
> and `lastInteractionMeasure`; T8a–e the stubs; then the docs, with the CLAUDE.md and Copilot-instructions
> guardrail amended as authorised. The World Clock prove-it test was untouched. Verification, in
> [PERFORMANCE.md](../PERFORMANCE.md#one-day-clock--the-idle-paint-ab-and-the-fixed-hour-parity-check-2026-10-13-roadmap-48):
> idle busy −1.3 % and paint +2.8 % against the branch base (inside the spread), and the static scene layers
> byte-identical to the base at ten fixed hours.
>
> **Where the inventory below was wrong when it was built (all re-checked against the tree on 2026-10-13):**
> - **`loadSession` is live and was left alone** (item 9): `OffScreen.tsx` calls it to apply a picked save, and
>   [SESSION_STORAGE.md](../SESSION_STORAGE.md) lists it correctly.
> - **`theme` had no reader** (item 7): `realWorldGradient.ts` no longer reads it, so all four dials were plain dead
>   code.
> - **`attachFlickerAnimation` had two tests, not four** (item 9).
> - **`isWarmHue` and `nearestAccentIndex` were exports of the shipped palette pull** (Phase 35), not leftovers of
>   this phase's own making; their checks moved onto `satCapFor` and a plain band test, and `secondaryFor` keeps its
>   brute-force oracle (which covers the 0/360 seam through the same helper).
> - **`loadToLimits` and `withLoadParam` kept their coverage**: the tests now call `withParam(…, 'load', …)` and a
>   small both-axes helper, and only the tautological "agrees with loadToLimits" checks went.
> - **Line numbers had drifted** (the `AudioEngine` subscriber was at 559–569, not 541–543); every claim was re-grepped.
> - **`Factory.tsx`'s `buildingPhase`**: the roadmap's `buildingSeed % FLICKER_PERIOD` would have given two phase
>   slots, not eight; `flickerPhase` keeps the old spread exactly.
>
> **Noticed, not touched:** [BUILDING_DESIGN.md](../BUILDING_DESIGN.md)'s "Offline" passage still describes the
> offline system Phase 43 removed (`offlineSince`, a 66-measure outage).

### About

**What is true today.** The visual day is `computeLocaleHour(locale.dayStartTimestamp)`
(`src/constants/time.ts`): 6 minutes, started at hour `abs(x % 24)` by `buildLocale`
(`src/systems/worldTransition.ts:64`). `AttenuationStyleView`'s per-second tick writes it to
`uiStore.activeLocaleLocalTime`, and ten components read it from there. The musical clock is the beat
clock's measure count: battery, docking and pitch drift tick per measure (`src/systems/robotSystems.ts`,
the replay), the harmony palette advances every 2 measures with no hour meaning
(`src/engine/harmonySystem.ts`; [HARMONY_SYSTEM.md](../HARMONY_SYSTEM.md) already states the
decoupling), swells roll per 16n. Nothing musical reads the day; nothing visual reads a measure. The
musical day is dead in practice and survives only as vocabulary.

**Incorrect code to remove** (each with its tests):

1. **`getCurrentHour()` and `MEASURES_PER_HOUR`** (`src/engine/beatClock.ts:22`, `:141`) — zero
   production callers; `src/constants/index.ts:72` already says so.
2. **The `% DAY_CYCLE_MEASURES` wrap on `subscribeToMeasure`'s callback argument**
   (`beatClock.ts:58`). Both live subscribers route around it or misuse it: `startRobotLifecycle`
   ignores the argument and reads `getCurrentMeasure()` because a wrapped count made a hold set near
   the boundary unreachable (`robotSystems.ts:232–237`), and `AudioEngine` writes it into a dead field
   (next item). Pass the real monotonic measure. Reword the trap notes at `robotSystems.ts:232–236`
   and in [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md)'s audio-swells paragraph (the `% 96` sentence).
3. **`Locale.currentMeasure`** (`src/types/locale.ts:29`) — written every measure by
   `src/engine/AudioEngine.ts:541–543` (the wrapped value), re-written as a mount-time no-op by
   `src/App.tsx:28–34`, read by nothing. A Zustand write on every measure for no reader; any selector
   that takes the whole locale object re-renders on it (`LocaleView.tsx`'s own comment records paying
   that cost). Delete the subscription and its "updates visuals (lighting) and allows harmony to
   derive from measures" comment (both false today), the `App.tsx` effect, the field, its `0` defaults
   (`src/stores/localeStore.ts:97`, `worldTransition.ts:69`) and `currentMeasure` in the 14 test files
   that build a `Locale`. Correct the `createdAtMeasure` doc comment (`types/locale.ts:19–24`), which
   calls the field "never incremented by the real tick system" — the writer was `AudioEngine`'s
   subscriber, not the lifecycle tick.
4. **The hour → "light measure" → angle round trip in five components** —
   `src/components/actors/Factory.tsx:286–304`, `actors/scenery/Scenery.tsx:91–92`,
   `worldView/LightShafts.tsx:58–59`, `worldView/TerrainLayer.tsx:57–58`, `worldView/WaterColumn.tsx:39–40`
   each compute `(localTime / 24) * DAY_CYCLE_MEASURES` to feed `getLighting(measure)`
   (`src/utils/lightingUtils.ts:90`), which divides by 96 again. `getLighting(hour)` takes the 0–24
   hour directly; same curve, same gamma, landmarks restated in hours (midnight 0, east peak 9, noon
   12, west peak 15). `FLICKER_PERIOD` (8 measures, "roughly every 2 hours") becomes 2 hours and
   `buildingPhase = buildingSeed % FLICKER_PERIOD` keeps its spread in the new unit; `Factory.tsx:37`'s
   "driven by `currentMeasure`" comment goes with it. `src/components/robot/RobotBody.tsx:85` already
   takes the hour straight — the model to follow. `DAY_CYCLE_MEASURES` leaves `lightingUtils.ts` and
   the six lighting tests that import it.
5. **`DAY_CYCLE_MEASURES`** (`src/constants/index.ts:76`) — no consumer left after 1–4. Delete it and
   its comment. [DUPLICATE_VALUE_AUDIT.md](../DUPLICATE_VALUE_AUDIT.md) item 2 is marked superseded by
   this phase: it centralised a constant that turned out to have no reason to exist.
6. **Docs.** CLAUDE.md's Melody Logic guardrail loses "96 measures = 1 day cycle" and gains the
   wall-clock rule — proposed wording: *"Melodies must store note indices (0..7), never literal pitch
   strings. The in-world day is wall-clock: a fixed `DAY_DURATION_MS` (6 real minutes) from the
   locale's `dayStartTimestamp`, never tempo. Measures count music and the fleet's lifecycle; nothing
   musical defines a day."* Then [BEAT_CLOCK.md](../BEAT_CLOCK.md) (the constants table,
   `getCurrentHour`, "fires … wrapped to `0..95`", "Day/night derivation is always …"),
   [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md) ("96 measures = 1 full day/night cycle" and the
   `getCurrentHour` import in its example), [BUILDING_DESIGN.md](../BUILDING_DESIGN.md) §Day/Night
   Cycle (rewritten around the hour), and the docs test.

**Verification.** A parity test first: `getLighting` at hours 0 / 9 / 12 / 15 equals the old function
at measures 0 / 36 / 48 / 60, then the measure form is deleted. The World Clock prove-it test
(`robotSystems.test.ts`) unchanged and green. Full suite, types, lint. `npm run perf` idle-paint A/B
against the branch base (docs/PERFORMANCE.md): one fewer store write per measure should be neutral or
better, never worse. One before/after screenshot at a fixed hour confirms no visual change.

**The same class elsewhere** (spot check at Crawford's "can you spot check for other similar dead
code?", 2026-10-09: a scripted reference count over `src/` with tests excluded, every hit then read by
hand; added to this item the same day, "add the rest to item 48"). The seed and coordinate override
primitives in `src/utils/seedUtils.ts` are deliberately NOT on this list — backlog item 19 brings
`?seed=`/`?x=`/`?y=` back and decides their fate (see Not Doing).

7. **Dials nothing turns, in `uiStore`** (`src/stores/uiStore.ts`): `activeView` + `setActiveView` +
   the `ActiveView` type (the pre-hub view switch, zero references); `isFullscreen` + `setFullscreen`
   (zero references; the comment at `:222` describes components that do not exist); `theme` +
   `setTheme` (read once by `src/utils/realWorldGradient.ts`, never set — the constant `'dark'` left
   by the cut Console Theming phase, [11](#11-console-theming--cut); the gradient hardcodes dark);
   `language` + `setLanguage` (no reader — the two text hits are the English word in comments).
8. **Fields written but never read, or neither** (`src/types/Robot.ts:137–139`): `Robot.createdAt`,
   stamped at spawn "for removal ordering" (`src/systems/spawnSystem.ts:707`) and read nowhere;
   `Robot.lastInteractionMeasure`, no reader and no writer since `interactionSystem.ts` was deleted
   ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md) already records it). Neither is in `SessionPayload`.
9. **Stubs and self-admitted keepers** — production never calls them; tests keep them alive:
   `attachFlickerAnimation` (`src/components/actors/greebles/rooftopGreebles.tsx:616`, a placeholder
   returning a no-op, four tests asserting the no-op); `loadToLimits` (`src/utils/audioBudget.ts:92`,
   its own comment says it is kept only so a pre-split test still runs); `withLoadParam`
   (`audioBudget.ts:184`, its comment says "every existing caller uses it" — there are none,
   `audioBudgetSystem.ts:131` calls `withParam` directly); `gridUnitsToDuration`
   (`src/engine/melodyGenerator.ts:384`, "kept as a general-purpose utility", unused); `loadSession`
   (`src/utils/sessionStorageEngine.ts:81`, no caller — `SessionListItem.tsx:40` applies the listed
   entry's own payload; [SESSION_STORAGE.md](../SESSION_STORAGE.md) lists it as live API and drops
   it); `pickSilhouetteFill` and `assertInViewBox` (`src/components/actors/silhouetteUtils.ts:48`,
   `:76` — the second has no reference anywhere, not even a test); `nearestAccentIndex` and
   `isWarmHue` (`src/utils/accentLean.ts:93`, `:134`, test-only). Each goes with its tests.
10. **Stale comments naming removed things**: "CompanyManager" at `uiStore.ts:88` (the component is
    gone; the field it describes, `selectedCompanyId`, is live); "`TIME_PITCHES`" at
    `src/constants/index.ts:57` (the palette table has been `HARMONY_PALETTES` since the sequencing
    rewrite).

**Excluded on purpose:** the nav tree family (`useNavTree`, `navTreeConfig`, `accordionSync`,
`useAccordionOpenState`, `useSectionObserver`, `RobotSectionAccordionStack`), which the layout
rework's Tasks 9 and 18 delete; the ~250 exports referenced only by tests as deliberate seams
(constants, `lifecycleSim.ts`'s sim runners, `src/testUtils/`); and the ~100 exported types used only
inside their own file (export hygiene, not dead code). The scripted count is a heuristic — re-run it
and re-read each hit before deleting, since the tree moves.

### Not Doing (and why)

- **Moving battery, docking or pitch drift onto the wall clock** — replayability is the top priority
  (Crawford, 2026-10-09). The fleet cycles in bars and runs faster at a higher BPM; accepted.
- **Deriving the day from measures (one musical clock)** — a day would be 384 beats ÷ BPM: 1.9
  minutes at the slider's 200, 19 at its 20, and the off screen's lit world would freeze at one hour
  with the transport stopped. The "30-second day" Crawford ruled out.
- **Changing the 6-minute day** — not asked; it would be a separate dial, and the arrival-hour-by-x
  rule depends on the day length only through `dayStartTimestamp`.
- **Tempo-syncing the LFOs** — backlog item 17: free-running Hz is intentional.
- **Removing `seedUtils.ts`'s seed and coordinate override primitives**
  (`setGlobalAttenuationStyleSeedOverride` and its getter, `parseCoordinateParam`,
  `setLocaleCoordinateOverride`, `getLocaleCoordinateOverride`, `LocaleCoordinateOverride`) — no
  production caller today, but backlog item 19 brings `?seed=`/`?x=`/`?y=` back and its spec decides
  whether they are reused or replaced by the `?session=` boot path. They join this list only if
  replaced.

## 49. Robot Pan: a Pan Slider Beside Volume, with Auto

Raised by Crawford, 2026-10-09, on `feature/layout-rework`: "we need to give the user panning ability
on the robots … put it in the section with volume, along with an 'auto' button that connects it to the
robot as it works today." Interviewed, specced and built (status below). A small audio-UI phase on top of the Robot
screen the layout rework delivers (its Levels tab,
[docs/tasks/LAYOUT_REWORK.md](../tasks/LAYOUT_REWORK.md) Task 16); the component it extends,
`AudioSettingSection`, is reused unchanged by the rework, so the code can land before or after it —
build after, so the slider is laid out once, on the screen that ships.

**Status: built 2026-10-13 on `feature/panning-update`** (intent [robot-pan.md](../intent/robot-pan.md), spec
[ROBOT_PAN.md](../specs/ROBOT_PAN.md), plan [ROBOT_PAN.md](../tasks/ROBOT_PAN.md); tasks T1–T13 committed,
guard test `src/docs/robotPanDocs.test.ts`). Crawford's listen (plan Task 14) signed off; the docs pass is Task 15.
The "Shape" bullets below are the original starting point, not what shipped: read "As built" first.

### As built (deltas from the Shape below)

- **One `pan` field, no remembered manual value.** `Robot.pan` (−1…1) and `Robot.panAuto` (spawn default
  `true`, `pan` 0). Switching Auto **off** copies the live position into `pan` in the same action
  (`applyPanAuto`), so the slider never jumps and nothing "survives a round trip through Auto"; the Shape's
  separate manual value was rejected in the interview. Auto **on** is the flag alone: the stored `pan` is
  ignored while it is on.
- **The robot keeps moving with Auto off.** Only the panner stops following it; the work loop, swim and job
  timelines and `Robot.position` are untouched. A source-scan test pins that `workLoop.ts`, `siteChoice.ts`,
  `lifecycleSim.ts` and `src/animation/` never read `pan` or `panAuto`.
- **Full ±1 manual range**, against the ±0.5 Auto field, which is unchanged. Displayed and edited as a signed
  −100…100 (`PAN_DISPLAY_SCALE`), no L/R letters, the same display-versus-storage split as Volume.
- **A live readout, through its own store.** While Auto is on, the slider is a read-only readout of the
  engine's position-follow pan. `robotPanReadoutStore` (`useRobotPanReadoutStore`) is written only on the
  AudioParam writes `updateAllPanners` already makes, so Auto's audio is unchanged and no roster, card or world
  subscriber is touched. `localeStore` would have churned the `robots` array on every tick.
- **`SliderCenteredZero.readOnly`.** The primitive gained an optional `readOnly` branch (`role="status"`, no
  Radix root), mirroring `SliderLinear`'s Phase 15.1 mode but keeping the help "?". The Pan row is a
  `DirectionalPanel` holding that slider and a bare `Toggle`.
- **Engine.** `AudioEngine.updateRobotPan(id, number | null)` and `getLivePan(id)`; a module-level
  `manualPanByRobot` map that `updateAllPanners` skips and `releaseVoice` clears; a `PAN_RAMP_SECONDS` (0.05 s)
  ramp both ways, so Auto on glides back with no click. A manual pan is re-primed from the store at every
  reservation path (`loadInstruments`' post-load pass, `reRegisterAllRobotsAudio`, `reReserveVoice`); a fresh
  spawn is always Auto and needs none.
- **Companies broadcast both, from `useCompanyOptions`**, not `CompanyOptionsSection` (the layout rework moved
  the handlers into the hook). Auto off holds each member at **its own** live position until the slider is next
  touched, which then puts every member at one value; the company screen shows the snapshot and never
  subscribes to the readout store.
- **Persisted, unlike `masterVolume`.** A manual pan is a composition choice, so it saves: one optional `pan`
  key on `RobotAudioOverrideDiff` (present means Auto off), and `p` on the share-link wire format. Payload
  `version` stays 2. See [SESSION_STORAGE.md](../SESSION_STORAGE.md).
- **Copy.** *Bearing* / *Tracking* are placeholder lore words awaiting Crawford's copy pass (two strings in
  `src/content/copy/probe.ts`).

### About

**What exists, verified 2026-10-09.** Every reserved robot already has a stereo panner on its own bus
(`composite.output → panner → busGain → busFilter → chain`, `src/engine/AudioEngine.ts:611–679`), and
it already follows the robot: `updateAllPanners` (`AudioEngine.ts:308`) runs once per 16th-note tick
from the melody playback loop (`:422`), reads each robot's **live GSAP x** through
`getRef('robot-<id>')` (`getRobotVisualX`, `:204` — falling back to `Robot.position.x`, then to the
scene's centre), maps it with `calculatePanFromPosition(x) = x / WORLD_WIDTH − 0.5`
(`src/engine/audioEngine/panning.ts`, so the whole 1920-wide stage spans only **±0.5**, "keeps voices
more centered for a cohesive mix"), and skips the AudioParam write when the value moved less than
0.0005. So a robot's sound already swims across the field with it, leg by leg. There is no user
control over any of this; `AudioAttributes`, `CompanyOptionsSnapshot` and `RobotAudioOverrideDiff`
have no pan field, and pan is neither an LFO target (`RobotLfoTargetId`, `src/types/lfo.ts`) nor a
swell attribute (`SwellRobotAttributeId`).

**The feature.** In the Levels block — `AudioSettingSection.tsx`, today the Audio Setting radio over
the Volume slider — a **Pan** row: a centred-zero slider (left … centre … right) and an **Auto** toggle.
Auto on, the default and today's behaviour: the panner follows the robot's position exactly as above
and the slider reads the live value back (read-only). Auto off: the slider's value is written to the
panner and `updateAllPanners` leaves that robot alone. Companies broadcast both, the way Volume does.

**Shape, as a starting point for the spec (not decided):**

- **Model** — two JSON-serialisable fields on `Robot`: `panAuto: boolean` (spawn default `true`) and
  `pan: number` in [−1, 1] (default 0), kept separately so a manual position survives a round trip
  through Auto. Seeded like everything else at spawn (`spawnSystem.ts`), i.e. always `true` / `0` — no
  noise draw, so no change to any existing world.
- **Actions** — `applyPan` / `applyPanAuto` in `src/systems/robotOptionsActions.ts`, mirroring
  `applyVolume` (`:35`: `updateRobot` + one engine call). Engine: `AudioEngine.updateRobotPan(id, value)`
  on the pattern of `updateRobotMasterVolume` (`:887`), and a module-level `manualPanByRobot` map the
  hot loop consults, so `updateAllPanners` stays store-free and simply `continue`s past a manual robot
  (cleared in `releaseVoice`, like `lastPanByRobot`).
- **UI** — `SliderCenteredZero` (`src/types/controls.ts:104`; the Oblique Cabinetry centred slider,
  [11.1.5](#1115-oblique-cabinetry-slidercenteredzero)) and `Toggle` (`:128`), composed in
  `AudioSettingSection` with a third `DirectionalPanel` row; schema in `robotOptionsConfig.ts` beside
  `VOLUME_SCHEMA`. Existing components only (layout decision 10). The toggle holds its largest-content
  size on flip. Both controls get a help popover description (layout spec §1.4).
- **Company** — `CompanyOptionsSnapshot` gains `pan?` / `panAuto?`; `CompanyOptionsSection`'s handler
  mirrors `handleVolumeChange` (`:313`: broadcast to every member, patch the snapshot). Broadcast, not
  link ([COMPANIES.md](../COMPANIES.md)).
- **Content** — `probe.pan` (human "Pan", a lore name in the
  [copy-tone-guide](../reference/copy-tone-guide.md)'s voice, unit L/R) and `probe.pan.auto`, plus
  their descriptions, in `src/content/copy/probe.ts`. Never a literal in the component.
- **Persistence** — `masterVolume` is on [SESSION_STORAGE.md](../SESSION_STORAGE.md)'s "explicitly
  never persisted" list; pan should follow the same rule unless the interview says otherwise (Auto is
  the default, so an untouched robot needs nothing saved either way).

**Guardrails this must respect.** Pan is an audio setting and reaches the body through **no** dial —
[ROBOT_DESIGN.md](../ROBOT_DESIGN.md)'s dial list is unchanged and the Visual Mapping guardrail holds
(nothing on the gem moves with pan). The panner write stays inside `AudioEngine`, on the transport
tick, never from a GSAP callback. No new Tone nodes: the panner exists already, so the Audio Load
Budget is untouched, and manual robots mean fewer writes per tick, not more.

**Questions for the interview:**

- Range and labels: does a manual pan get the full ±1, or the ±0.5 the auto mapping keeps to? Slider
  shows L / R percentages, or just a centred bar?
- While Auto is on, does the slider show the live value (a small per-tick store write, or a read on
  the lighting tick) or sit greyed at centre?
- Does a company's Auto broadcast as well as its pan value, and what does the company screen show
  when members disagree (today's resolve-to-snapshot rule)?
- Should a user-panned robot stop following when it swims — yes by definition — and should turning
  Auto back on snap or glide to the live position (a `rampTo` on the panner, same as volume)?
- Phone speakers are mono: nothing to do, but worth saying in the help copy?

### Not Doing (and why)

- **A pan LFO target** — autopan is tempting, but the per-robot `volume` LFO target was removed as
  "not as impactful as I had hoped" (docs/specs/LFO_LOAD_FIX.md); a pan target is the same class of
  decision and a separate one, with its own load cost on phones.
- **Pan as an audio-swell attribute** — swells ride volume and the global chain; adding a target is a
  swells design change, not a slider.
- **Changing the auto mapping** (its ±0.5 span or the visual-x read) — "as it works today" is the
  brief; a wider auto field would change every existing world's mix.
- **Any visual sign of pan on the robot** — the Visual Mapping guardrail.

## 50. Audio Palette: New Attributes Without New Libraries

Raised by Crawford, 2026-10-09, on `feature/layout-rework`: "what other audio attributes, aside from
changing up the oscillators, could we use without adding more libs … global effects, plugins, wah
pedals, portamento", then "if we can organize it and make it happen without distortion, then i want to
at least try it … let's get your suggested ones into the roadmap, and add the rest as backlogs for us
to try and see what works." Seven sub-phases below, in build order (50.1 → 50.7; 50.6 and 50.7 were added later; 50.5 is the former backlog item 21,
built 2026-10-16); the rest of the menu is backlog items 22–24 ([backlog.md](backlog.md#22-audio-palette-trials-more-global-pedals-to-audition)).
Not yet interviewed or specced — each sub-phase gets its own `/interview-me` → spec → plan, each small
enough to land in a sitting. Build after the layout rework's Phase 2 (section tabs), so every new
control is laid out once on the screens that ship.

### About

**Grounding (verified 2026-10-09, citations re-verified 2026-10-13).** Tone.js `^15.1.22` is the only audio dependency and nothing is
added. Today the app constructs: per robot, up to three `Tone.Synth` layers
(`src/engine/audioEngine/compositeVoice.ts:143` — oscillator type / pulse width / detune / phase /
per-layer gain, one shared ADSR with no curve settings) into a bus of `Panner → Gain → Filter`
(`src/engine/AudioEngine.ts:685–708`; the filter's cutoff is `AudioAttributes.filterFreq`, seeded only,
no UI); globally `EQ3 → LPF → HPF → Delay → Reverb → Compressor → Limiter`, or the Compressor ahead of
the Delay under Controlled Decay (`src/engine/audioEngine/globalFx.ts:147–149`); two `Tone.LFO`
engines; nothing else. Robot LFO targets are layer gain / detune (`src/types/lfo.ts:43`); global targets
are the EQ bands and filter frequency / Q (`:76`). Everything below is a Tone 15 class or parameter the
app does not use yet.

**Shared constraints — every sub-phase, no exceptions:**

- **"Without distortion" is the gate.** Each sub-phase is measured the way the Audio Load Budget was
  ([AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md) §Audio Load Budget; the archived spec
  [AUDIO_LOAD_BUDGET.md](../specs/archive/AUDIO_LOAD_BUDGET.md) §7;
  [scratchy-audio-phones.md](scratchy-audio-phones.md)): the same `?session=` world, A/B against the
  branch base on the Pixel, the `?debug` HUD's output-underrun count (`src/utils/audioHealth.ts`) at
  Standard and at Full, plus `npm run perf` on the desktop, against the series baseline recorded in
  [scratchy-audio-phones.md](scratchy-audio-phones.md#baseline-for-the-audio-palette-series-roadmap-50--crawfords-run-2026-10-13)
  (seed `alpha`, Full: 0 underruns in 3:00 on `main` at `ca2b6868`). A feature that raises underruns ships
  behind the Effects Limit — a new `LOAD_*_MIN` threshold beside `LOAD_FILTER_LFOS_MIN`
  (`src/constants/index.ts:44–46`) — or not at all.
- **Where nodes may be added.** New nodes go on the global chain (one instance) or as a per-robot
  send `Gain` (one cheap node each). Robots otherwise get *parameters on nodes they already have*.
  Twelve of anything else is the phone's problem.
- **Replayability stays first** (the 2026-10-09 time decision, [48](#48-one-day-clock-remove-the-measure-based-day)).
  Every decision — a seeded default, a humanize offset, a skip roll — keys off
  `getSeededVal(noiseMap, dataId, …)` and the measure or note index, the way velocity already does
  (`computeNoteVelocitySeeded`, `AudioEngine.ts:491`). An effect's *internal* oscillator (Chorus,
  Phaser, Tremolo…) is wall-clock like the LFO Bank's phase: the accepted class, recorded in
  backlog 17.
- **Architecture rules.** Every AudioParam write lives in `AudioEngine` / `globalFx.ts`, on the
  transport tick or from an action, never from a GSAP callback. State stays JSON-serialisable:
  numbers and strings on `AudioAttributes` / `OscillatorLayer` / `GlobalAudioSettings`, never a node.
- **Seeded and saved like the existing fields.** Spawn: a new `dataId` draw in `spawnSystem.ts` /
  `globalAudioSeed.ts`, with a row in `GLOBAL_AUDIO_LOADING_RANGES`
  (`src/data/globalAudioLoadingRanges.ts`) mirrored in
  [GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md), and a band in the themes idea
  ([themes.md](../ideas/themes.md)). Session: optional on `SessionPayload` / `RobotAudioOverrideDiff`,
  absent = the seeded value, like every field since v1. The app is pre-v1, so a seeded default may
  change how every world sounds; the phone gate is the only check on a new sound.
- **UI.** Content keys with lore names in the
  [copy-tone-guide](../reference/copy-tone-guide.md)'s voice, a help popover per control, existing
  primitives only (layout decision 10), inside the Fleet Params / Robot section tabs
  ([LAYOUT_REWORK.md](../specs/LAYOUT_REWORK.md) §1.4 / §1.5). Companies broadcast per-robot fields
  the way Volume does (`CompanyOptionsSnapshot`). Nothing reaches the robot's body (Visual Mapping
  guardrail).

### Not Doing (and why)

- **Per-robot effect nodes** (a chorus or a distortion each) — twelve instances on a phone; sends
  and parameters instead.
- **`Tone.PitchShift`** (granular, the heaviest effect in the library) and **`Panner3D`** per robot
  (HRTF per source) — neither clears the gate by inspection.
- **`AutoFilter` on the global chain** — already achievable: the global LPF plus a Bank lane.
- **New oscillator types** (`fat`, `am`, `fm`, partials) — "aside from changing up the oscillators",
  Crawford's own exclusion; a separate conversation.

**Classic Band Retune (2026-10-21, on eature/classic-band-retune).** One tuning pass over the seed bands a fresh world rolls
within, after 50.1–50.6 and before Robot Effect Sends ([50.7](#507-robot-effect-sends-grit-shimmer-and-double)), whose room bands are written against it. Plan, decisions and
measurements: [CLASSIC_BAND_RETUNE.md](tasks/CLASSIC_BAND_RETUNE.md). A Mix is stored as a slider position and squared at the node,
so the bottom third of every Mix slider is near silence (a wet layer of −48 dB at 0.05, −20 dB at 0.25); the floors rose, the
ceilings from the listens stayed, and the three colour Mixes, after a first raise to 0.2–0.35, ended at one shared 0.1–0.2 under the original 0.25 ceiling (Crawford's listen: "much more subtle"). Also: Vibrato at near-full wet and a small depth,
AutoWah sensitivity −20 to −5 dB, Chorus delay 6–15 ms, high-pass cutoff 20–120 Hz, Tremolo Sync odds 0.75 (PEDAL_SYNC_ODDS is
per pedal), Reverb pre-delay 0–0.25 s with a clamp in setGlobalReverb, the per-robot Reverb send 0.1–0.6, and the Compressor
−36 to −18 dB at 2–6:1 (the Web Audio compressor adds automatic makeup gain, so the old deep band swung fleet loudness by about
11 dB between seeds). Defaults are untouched and only fresh worlds change. **Status:** built and committed; Crawford's listen
(Checkpoint B) is the open gate, and anything he vetoes reverts one row at a time.

## 50.1 Robot Articulation: Portamento, Envelope Curves, Bus Filter

Zero new nodes: three per-robot attributes that are parameters on nodes every robot already has, so
the budget cost is nil and the phone gate is a formality.

- **Portamento.** `Tone.Synth` is a `Monophonic`; its `portamento` (seconds) is never set, so every
  note steps. One slider per robot (0 = today) glides each layer's frequency into the next note.
  Envelope section, beside ADSR. Default: off, or a low seeded chance of a glider — the interview decides.
- **Envelope curves.** `Tone.Envelope` accepts `attackCurve` / `releaseCurve` of
  `linear | exponential | sine | cosine | bounce | ripple | step` (and `decayCurve` linear /
  exponential); both sit at Tone's defaults today. A single-line "contour shape" radio beside the ADSR
  sliders; `ADSREnvelope` (`src/types/Robot.ts:53`) gains two optional string fields.
- **The bus filter, exposed.** `AudioAttributes.filterFreq` drives each robot's bus `Tone.Filter`
  (`resolveBusFilterCutoff`, `AudioEngine.ts:175`; `0` = open; Q is the fixed `ROBOT_BUS_FILTER_Q = 1`, `AudioEngine.ts:172`) but has no control, although
  `RobotAudioOverrideDiff` already carries it (`src/types/session.ts:22`). Add Cutoff and Resonance (Q)
  sliders and a type radio (lowpass / bandpass / highpass): a resonant bandpass *is* the wah, and a
  Bank lane on its frequency is an autowah. The per-robot LFO target `bus.frequency` is an *option*
  here, gated by `filterLfosEnabled`, since robot LFO count is what the budget fights
  ([17.2.7](#1727-performance-robot-lfo-priming)). Section: Source (spectral) or Levels — spec decides.

Verification: the composite-voice tests extended; a headless test that a glide / curve / cutoff edit
reaches the Tone node through the voice's `set` path (`compositeVoice.ts:240`); the phone A/B above,
expected flat.

**Status: built 2026-10-13 on `feature/palette-articulation`** (intent [robot-articulation.md](../intent/robot-articulation.md),
spec [ROBOT_ARTICULATION.md](../specs/ROBOT_ARTICULATION.md), plan [ROBOT_ARTICULATION.md](../tasks/ROBOT_ARTICULATION.md);
tasks T1–T14b committed, guard test `src/docs/robotArticulationDocs.test.ts`). Crawford's Pixel run passed: several minutes
on Full audio quality with no distortion
([scratchy-audio-phones.md](scratchy-audio-phones.md#robot-articulation-roadmap-501-on-the-pixel--crawfords-report-2026-10-13));
the HUD underrun counts, a Standard run and the manual listen list were not reported, so they are not claimed here.
The paragraphs above are the original starting point, not what shipped: read "As built" first.

### As built (deltas from the paragraphs above)

- **Two shape radios, not one.** Attack Shape and Release Shape, each the full seven curves (`EnvelopeCurveName`), sit in the
  Envelope drawer's third and fourth rows with a Portamento slider (`PingContourDrawer`). `decayCurve` is not exposed.
  Curves live on `ADSREnvelope.attackCurve` / `releaseCurve`, absent = linear; `toToneEnvelope` hands Tone a curve only when present.
- **Seeded as minority traits, so a fresh world is not silent on all three.** Every threshold was picked from the measured
  draw, not its nominal fraction (the draws bunch around 0.5): gliders ≈ 1.5 robots in 12 (0.05–0.20 s), shaped attack
  ≈ 1.9 and shaped release ≈ 1.8, accent (resonant) filters ≈ 2.4, a lit bus LFO link ≈ 1.6. The cutoff is re-seeded in two
  tiers: 2000–8000 Hz open lowpass for most, 400–2500 Hz with Q 3–8 for accents (bandpass 40 % of them, never highpass).
  Pre-v1, so this changes every world's sound by design.
- **Attack, Decay and Release now run 0–2 s** (`ENVELOPE_TIME_MAX_SECONDS`, was 0–10), and a shaped stage is seeded short
  (attack 0.03–0.25 s, release 0.15–0.8 s). Found by listening: at several seconds a robot's back-to-back 16ths never let the
  gate close, so it settles into a drone and neither times nor shapes can be heard. The seeded glide tops out at 0.2 s for the
  same reason. This reverses the earlier "0–10 s edit range" for those three sliders; spec §1.10.
- **The articulation object on `reserveVoice`.** One optional trailing `articulation?: { portamento?, filterQ?, filterType? }`
  rather than three more parameters, so existing call sites and tests compile unchanged; all four reservation paths pass it from the store.
- **The filter is a fourth Source subsection, `busFilter`** (`BusFilterDrawer`): Cutoff, its LFO link, then Resonance beside
  Type. One entry in `ROBOT_SECTIONS_CONFIG` feeds the nav tree, breadcrumb and both renderers. Edits are live through
  `AudioEngine.updateRobotBusFilter`; portamento through `updateVoicePortamento`. The lore words (Ping Glide, Onset Profile, Fade
  Profile, Resonator, Resonator Band, Resonator Peak, Resonator Mode, and the option words) are **placeholders**.
- **`bus.frequency` shipped as a seventh robot LFO target** (it was an option). It is a filter-tier target: the existing
  filter switch holds it off at Light, and the robot Filter subsection greys its link on its own flag. `audioSwell.test`'s
  superset assertion narrowed to the six layer ids and a new case pins that the bus cutoff is not a swell attribute.
- **T14b happened, and probably did not need to.** It was built on Crawford's instruction before any rise was reported:
  `LOAD_BUS_FILTER_LFOS_MIN = 0.8`, an effective `busFilterLfosEnabled` in `effectsLoadToLimits`,
  `lfoEngine.setBusFilterLinksEnabled` as a second suspend tier (a bus link is held off when either switch is off),
  `audioStore.busFilterLinksHeldOff`, and a `lfo drift · filter · bus` line on the `?debug` HUD. With the Pixel run clean, the
  tier holds the robots' own cutoff links off at Standard for no measured reason: **open question for Crawford, keep it or
  remove it**, and the 0.8 is a placeholder either way.
- **Persistence and companies.** Session diff and share link carry `portamento`, `filterQ`, `filterType` (`po`, `fq`, `ft`)
  and the curves inside `adsr` (`ac`, `rc`), each decoded and validated on its own. Company snapshots gain `portamento`,
  `filterFreq`, `filterQ`, `filterType`, broadcast per field (`useCompanyOptions`).
- **Zero new nodes**, pinned by a construction-count test in `AudioEngine.test.ts`; nothing on the gem reads any of it, pinned by
  the guard test's source scan. The HUD's `links` line counts 7 robot slots, so twelve robots read `n/91`.
- **Still open:** the lore-word verdicts, the manual listen list (glider, shaped contours, resonant robot, wah, type switch
  without dropout, held-off link at Light, save/reload/share, company broadcast, keyboard, every "?"), and the desktop
  `npm run perf` before and after.

## 50.2 Robot Sends: Per-Robot Reverb and Delay Depth

One `Gain` per robot. Today Reverb and Delay are inserts on the global chain with one `wet` each, so
every robot sits at the same depth. A per-robot **send** into each — `busFilter → sendGain → effect
input`, dry path unchanged — gives each robot its own distance, and pairs with
[49](#49-robot-pan-a-pan-slider-beside-volume-with-auto): pan is where, send is how far. Companies
broadcast it, so a company can be "the far ones".

The interview must decide the topology: a true send / return (effect `wet` = 1, the global "wet"
sliders become return levels, the `reverb.wet` / `delay.wet` rows of `GLOBAL_AUDIO_LOADING_RANGES`
re-ranged) versus keeping the inserts and adding sends on top (simpler, but a robot then has two paths
into the same reverb). `wireGlobalFxChain` (`globalFx.ts:146`) is the one place the chain is wired and
already rewires on the Decay toggle, so the send bus belongs there. Seeded default: the interview decides
(a seeded spread of depths is fair game; no world is held to today's sound). Swells currently ride
`reverb.wet` / `delay.wet` (audioSwells.ts's off-equivalent check); with the returns at full they could only
dip, so they move to the individual robots (Crawford, 2026-10-14): the sends join the robot swell pool and
the two `wet` targets leave the global pool. Phone gate: twelve `Gain`s is the cheapest node there is, but this is a topology change,
so it is measured.

**Status: built 2026-10-14 on `feature/palette-sends`, PR pending** (intent [robot-sends.md](../intent/robot-sends.md),
spec [ROBOT_SENDS.md](../specs/ROBOT_SENDS.md), plan [ROBOT_SENDS.md](../tasks/ROBOT_SENDS.md); tasks T1–T20 committed, guard test
`src/docs/robotSendsDocs.test.ts`). Crawford's Pixel run passed: Full and Standard for 3:00 each with no distortion by ear
([scratchy-audio-phones.md](scratchy-audio-phones.md#robot-sends-roadmap-502-on-the-pixel--crawfords-report-2026-10-14)); the
HUD underrun counts were not reported and the desktop `npm run perf` comparison was skipped at his call, so neither is claimed
here. He signed the manual listen list off as a whole ("i think all is fine"), not line by line. The paragraphs above are the
original starting point, not what shipped: read "As built" first.

### As built (deltas from the paragraphs above)

- **True send / return, two parallel rooms.** The interview's topology question was answered as a true send / return, and the
  rooms are **beside** the dry chain, not stages in it: `Tone.Reverb` and `Tone.FeedbackDelay` are permanently `wet: 1`, fed only
  by each robot's send gain and followed by a return gain. A robot at 0 is truly dry. A side effect worth knowing: Delay's echoes
  are no longer reverberated (the old serial order fed Delay into Reverb), which is the spec's assumption 1.
- **The global `wet` sliders became return levels** and are no longer seeded (every world loads `1`; the global quiet-Delay roll
  was deleted). They are relabelled "Reverb Amount" / "Delay Amount" with help text saying so. Their two Loading Range bands
  (`0.1–0.4`, `0–0.3`) were kept and now seed each robot's send.
- **Both Decay Modes keep their wiring-level behaviour** by changing only where the returns rejoin the dry chain: the Compressor's
  input for Natural, the Limiter's for Controlled. The in-app Decay Mode copy described the *opposite* of that wiring and always
  did; **resolved afterwards by correcting the copy to the wiring** (Crawford's call: the sound is unchanged; spec §7, point 2).
- **A seeded spread, with a quiet-Delay trait.** Reverb seeds in `0.1–0.4`; Delay in `0–0.3` with a roll under
  `SEND_DELAY_QUIET_THRESHOLD` (0.25) giving exactly `0`. The spec and plan say "about a quarter"; the roll's noise sample is
  bell-curved, so in practice it is **about 17–18 %** of robots (measured over four seeds × 2000 offsets). The threshold was left
  alone: ask before tuning.
- **An explicit prime at every reservation.** A send is never "default", so `AudioEngine.updateRobotSends` is called after the
  post-load pass, inside `reReserveVoice`, at both spawn reservations and on a session restore that carries a send;
  `reserveVoice`'s signature is not widened. A source-scan test pins the sites.
- **Swells moved to the robots, as answered.** The global swell pool is 7 (the two `wet` targets and
  `isGlobalTargetAtOffEquivalent` are gone); the robot pool is 19, the sends appended last and live only while above `0`. **The
  swell tick writes the stored fraction** through new `applyReverbSendValue` / `applyDelaySendValue`, not through the percent
  actions: `x * 100 / 100 !== x` for about 15 % of doubles, so a swell could not land exactly on its base through the percent
  path (`applyVolume` has the same round trip and was left alone). A hand edit cancels its own swell in the caller.
- **Persistence and companies.** Session diff and share link carry `reverbSend` / `delaySend` (`rs`, `ds`), compared at two
  decimals, a mid-swell save storing the swell's base, each decoded and validated on its own; the payload `version` stays 2.
  Company snapshots gain both, broadcast per field, with the swell flags read from the first member.
- **The seed oracle.** `globalAudioSeed.test.ts`'s "DO NOT REGENERATE" oracle was hand-edited in exactly four values
  (`reverb.wet` and `delay.wet` in `oracle-alpha` and `oracle-theta`, both to `1`); every other field in every oracle is
  byte-identical, which proves no other draw moved. Nothing was regenerated.
- **Nothing on the gem reads a send**, pinned by the guard test's source scan.
- **Corrected here:** the spec said the diagnostic's pre-chain tap "no longer includes echoes". It never did (EQ3's output fed
  only the LPF in the old serial chain too), so the diagnostic docs now say the chain changed and the taps did not.
- **Still open:** the lore words (Remoteness, Retrace Depth) are placeholders; whether the
  swell is too heavy a wash (the follow-up, only if asked, is a `SEND_SWELL_UPWARD_CEILING` through `clampSwellCeiling`); the HUD
  underrun counts and the desktop `npm run perf` comparison.

## 50.3 Global Colour: Saturation and BitCrusher

Two single-instance nodes on the global chain, each with a lore name — a degraded transmission is
on-brand. `Tone.Distortion` (soft overdrive: `distortion` 0–1, `oversample`) or `Tone.Chebyshev`
(harmonic waveshaper: integer `order`) — one of the two, chosen in the interview, since they fill the
same slot — plus `Tone.BitCrusher` (`bits`). Both have `wet`, so the seeded default can be fully dry
or a gentle seeded band (every world gains grit — the Phase 42 kind of call); the interview decides.
Position: after the filters and before the Decay stage, a new slot in both of `wireGlobalFxChain`'s
orderings. Fleet Params gets a new section tab ("Colour") or two rows in Output — spec decides against
the rework's tab row. Both are LFO-able (`distortion`, `wet`) if a Bank target is wanted later, not in
this sub-phase. Phone gate: waveshapers are cheap, `oversample: '4x'` is not — the gate sets the
allowed values and the Effects Limit drops oversampling first.

**Status: built 2026-10-15 on `feature/palette-colour`, PR pending** (intent [global-colour.md](../intent/global-colour.md),
spec [GLOBAL_COLOUR.md](../specs/GLOBAL_COLOUR.md), plan [GLOBAL_COLOUR.md](../tasks/GLOBAL_COLOUR.md); tasks T1–T11, T14 and T15
committed, T12 partial, T0 and T13b not done; guard test `src/docs/globalColourDocs.test.ts`). Crawford passed Checkpoints A, B
and C. Pixel: one Full 3:00 run, "no clipping" and "no underruns" by his word
([scratchy-audio-phones.md](scratchy-audio-phones.md#global-colour-roadmap-503-on-the-pixel--crawfords-report-2026-10-15)); the
world, the HUD numbers, a Standard run, the T0 re-baseline on current `main` and the desktop `npm run perf` comparison were not
recorded, so none is claimed here. The paragraphs above are the original starting point, not what shipped: read "As built" first.

### As built (deltas from the paragraph above)

- **All three nodes ship, not one of two.** The interview overturned "Distortion or Chebyshev": `Tone.Distortion`,
  `Tone.Chebyshev` and `Tone.BitCrusher` are all single instances on the **dry** chain, in that order, between the High-Pass
  Filter and the Compressor, in both Decay Modes. The Reverb and Delay returns rejoin after them, so the rooms' tails are
  never coloured. Nothing is per robot and none is an LFO or swell target.
- **No oversampling and no control for it.** `oversample` is `'none'` on both shapers, always, so the gate's "drop
  oversampling first" never applies. The Chebyshev cap stays at order 8; whether high orders are harsh at `none` was not
  reported from the listen, so it is not claimed either way.
- **A new Colour section tab and an eighth trait.** Fleet Params gains Colour between Time & Space and Output, with three
  sub-tabs (Distortion, Chebyshev, Bit Crusher), each two sliders. The `colour` trait is red + tangerine, kept at Checkpoint B.
  The copy is placeholder wording for the copy pass ("Bit Depth", not the spec's "Bit Crush", since a higher number is
  cleaner).
- **The Mix is tapered.** The stored Mix is the slider position and the node gets it squared (`colourWetGain`): after the
  Pixel listen the three were far too strong across a linear slider. Only the Mix is tapered. Stored values, seed bands and
  share codes keep meaning "slider position".
- **One character per world, at most one effect on.** A fresh world draws `clean`, `drive`, `fold` or `crush`, about 25 %
  each. The spec first drew three pair characters too (about 15 % of worlds); Crawford dropped them at T14. The lit effect's
  Mix seeds in its band, **Distortion 0.10–0.25 and Chebyshev and Bit Crusher 0.05–0.15**, and **no seeded Mix is above 0.25**
  (`COLOUR_LOAD_MIX_MAX`, a fresh world only). With the taper the seeded wet is about 0.01–0.06 for Distortion and 0.0025–0.02
  for the other two: quiet, and the bands are the knob if lit worlds read faint. The other effects seed Mix 0 but still draw
  their shape value.
- **The character edges are measured, not nominal.** The single draw is bell-curved and discrete (about 190 distinct values), so
  the nominal edges realised 10 / 34 / 18 / 30 / 4 / 4 / 0 %. The edges (0.3065 / 0.5 / 0.6935 / 1) are midpoints of the
  gaps nearest the cumulative 25 / 50 / 75 targets, fitted over 20 000 styles and held out over 3 000 (24.8 / 25.5 / 25.6 /
  24.0 %). The same method refits them if the shares move.
- **Old payloads load dry.** `withGlobalAudioDefaults` is called in `applySessionPayload` and the share decoder: no encoding
  change, `version` stays 2. A real crash was found on the way: an empty `globalAudio` used to throw. The recorded 50.2
  baseline link decodes with all three effects off.
- **Presets stay clean.** `DEFAULT_GLOBAL_AUDIO_SETTINGS` and the three transmission presets carry every Mix at 0.
- **The seed oracles were hand-amended, never re-recorded:** at T1 and T5 (the colour keys, then their values) and three times
  at T14 (the 0.25 ceiling, the lower Chebyshev and Bit Crusher bands, the one-character edges). Each value was derived from the
  raw draws by hand and checked by running the same formula on the old band, which reproduced the old numbers.
- **Beyond the spec:** every colour setter clamps into the field's full seed range and ignores a non-finite value (a share
  link is untrusted, and an `order` of 1e9 stalls the shaper-map build); a BitCrusher constructor failure `devWarn`s.
- **The phone gate was not fully run, and no threshold was built.** T13b (`LOAD_COLOUR_MIN`) exists only as a conditional
  plan task; nothing reported a rise.
- **Nothing on the gem reads a colour effect**, pinned by the guard test's source scan.
- **Still open:** the lore words are placeholders for the copy pass; the T0 re-baseline and a Standard run on the Pixel, and
  the desktop `npm run perf` comparison; which world the one clean run used (only a run with Bit Crusher alone at full Mix and
  4 bits, or all three at full Mix, proves the worklet question); and **per-robot colour**, raised by Crawford after hearing
  it (a send into each shared effect, the Robot Sends shape: one shared node plus twelve send gains). It reverses a stated
  non-goal and touches `Robot`, company options, the session codes, the Levels sliders, the swell pool and per-robot
  seeding, so it needs its own interview and spec; it is not scheduled.

## 50.4 Global Modulation Pedal: AutoWah or Phaser

One single-instance node, chosen in the interview. `Tone.AutoWah` is an envelope follower driving a
bandpass (`baseFrequency`, `octaves`, `sensitivity`, `Q`, `gain`, `follower`): it reacts to the fleet's
own dynamics and has no clock, so it is replayable in the only sense that matters. `Tone.Phaser`
(`frequency`, `octaves`, `baseFrequency`, `stages`, `Q`) carries its own LFO, so its phase is
wall-clock — the LFO Bank's accepted class — and its `frequency` could take the Free | Sync treatment
([33](#33-free--sync-toggle)). Either lands as one more slot in `wireGlobalFxChain` with `wet`, seeded
default dry or a low seeded band, the same call as 50.3. Whichever is not chosen moves to backlog 22.
Phone gate: a follower is a few nodes; Phaser's `stages` multiplies allpass filters, so the gate caps it.

**Decided with 50.3 (Crawford, 2026-10-14, "both of the other two"):** 50.4 ships **both** AutoWah and Phaser, as 50.3 shipped
all three of its nodes, so "chosen in the interview" and "whichever is not chosen moves to backlog 22" above no longer apply.
The cost notes stand for each, and the phone gate covers both.

**Interviewed 2026-10-15**, intent at [global-modulation-pedal.md](../intent/global-modulation-pedal.md): both pedals after Colour on the dry
chain, every parameter exposed, Phaser Rate with Free | Sync, a tab of their own between Colour and Output on the `spectral` trait,
each lit in about a third of fresh worlds independently of Colour, Mix tapered like Colour's.

**Status: built 2026-10-15 on `feature/palette-modulation`, PR pending** (intent [global-modulation-pedal.md](../intent/global-modulation-pedal.md),
spec [GLOBAL_MODULATION_COLOUR.md](../specs/GLOBAL_MODULATION_COLOUR.md), plan [GLOBAL_MODULATION_COLOUR.md](../tasks/GLOBAL_MODULATION_COLOUR.md);
tasks T1–T13, T14 (partial), T16 and T17 committed; T0 and T15b not done; guard test `src/docs/globalModulationDocs.test.ts`).
Crawford passed Checkpoints A and B (B partly: he heard the AutoWah; the phone shell, a Stages drag and Free/Sync/tempo were not
explicitly confirmed). Checkpoint C's by-hand save → reload → share-link check was not reported. Pixel: one Full 3:00 run with both
pedals at full Mix and 12 stages, "some underruns" and no distortion by his word
([scratchy-audio-phones.md](scratchy-audio-phones.md#global-modulation-roadmap-504-on-the-pixel--crawfords-report-2026-10-15)); the
underrun count, the world, a Standard run, runs (a) and (b), the T0 re-baseline and the desktop `npm run perf` comparison were not
recorded, so none is claimed here. The paragraphs above are the original starting point, not what shipped: read "As built" first.

### As built (deltas from the paragraph above)

- **Both pedals ship.** `Tone.AutoWah` then `Tone.Phaser`, single instances on the **dry** chain between BitCrusher and the
  Compressor, wah first, in both Decay Modes. The Reverb and Delay returns rejoin after them, so the rooms' tails are never swept.
  Nothing is per robot and neither is an LFO or swell target. From the Phaser onward the dry chain is stereo (`StereoEffect`);
  everything downstream is stereo-safe, and the mono wah before it is the reason to keep wah first.
- **Every Tone parameter is a slider**, thirteen in all: the AutoWah's seven (`baseFrequency`, `octaves`, `sensitivity`, `Q`,
  `gain`, `follower`, `wet`) and the Phaser's six (`rate`, `octaves`, `baseFrequency`, `stages`, `Q`, `wet`).
- **A Modulation section tab on the existing `spectral` trait.** Fleet Params gains Modulation between Colour and Output, with two
  sub-tabs (AutoWah, Phaser); no new trait. The lore words (Pressure Sweep, Phase Lag and the tab's name) are placeholders for the
  copy pass.
- **The Phaser's Rate is the third Free | Sync field** (`PhaserSettings.sync?`, `resolvePhaserRateHz`, `phaserToSync`,
  `phaserToFree`, `setPhaserSyncMode`; a tempo change re-pushes a synced Rate), on a `TempoSyncSlider` row. Its LFO is wall-clock,
  not on the transport.
- **`stages` rebuilds the node.** It is constructor-only in Tone, so a changed count builds a new Phaser with every other field's
  last-written value, re-wires the chain in the last Decay Mode, then disposes the old one. Verified headless with real Tone 15
  (a 1 → 12 drag, Decay flips, Sync with a tempo change): no exceptions or engine warnings and the master level steady. Whether a
  Stages drag ticks audibly was Task 16's ear test; Crawford closed that task and **Stages stayed a slider**, with no seeded-only
  change asked for.
- **The Mix is tapered like Colour's** (`colourWetGain`, squared at the node).
- **Seeding is uniform draws.** All four roll draws and all thirteen value draws use `getUniformSeededVal`, not the plain draw:
  measured over 20 000 styles, the plain draw gave `autoWah.lit` 24 distinct values and put a lit wah in 55.9 % of clean-Colour
  worlds against 26.8 % of coloured ones (not independent of Colour, which the intent required), and `autoWah.gain` and
  `autoWah.wet` took 3 distinct values over 3 000 styles. With uniform draws: AutoWah lit 33.07 %, Phaser lit 33.30 %, both 11.22 %
  (product 11.01 %), 50.2 % of lit Phasers Sync, all independent of Colour. So `PEDAL_LIT_EDGE` is the nominal 1/3 with no fitting
  and `PHASER_SYNC_ODDS` is 0.5. A dark pedal seeds Mix 0 but still draws its shape values.
- **The bands were retuned at T16 to Crawford's recommended ranges, then the Mix was brought down.** AutoWah: baseFrequency 50–250, octaves 2.5–5, sensitivity
  −40 to −10, Q 2–6, gain 2–6, Mix 0.2–0.5 (follower unchanged, 0.1–0.4). Phaser: rate 0.1–2.5, octaves 2–5, baseFrequency
  200–800, stages 4–12, Q 1–10, Mix 0.15–0.4. **The pedal Mix no longer shares Colour's 0.25 load ceiling** (`COLOUR_LOAD_MIX_MAX`
  stays 0.25 for the three colour effects); with the taper a seeded pedal Mix is a node gain of about 0.04–0.25 (wah) or 0.02–0.16
  (phaser). The Mix was first set to his recommended 0.3–0.7 and 0.25–0.6, which he found too loud, and brought down by about a
  third. Stages now seed up to 12, the count the Pixel run used.
- **Old payloads load dry and a bad `phaser.sync` is dropped** (`withGlobalAudioDefaults` at both call sites;
  `sanitizePhaserSync` in `applySessionPayload`). No encoding change, `version` stays 2.
- **Presets stay clean.** `DEFAULT_GLOBAL_AUDIO_SETTINGS` and the three transmission presets carry both pedals at Mix 0.
- **The seed oracles were hand-amended, never re-recorded:** at T1 and T7 (the pedal keys, then their values: alpha has AutoWah dark
  and the Phaser lit and synced, theta the reverse) and again at T16 for the retuned bands and for the lower Mix, each value re-derived from the
  old raw draw and checked against it.
- **Deviations from the plan:** a failed Phaser rebuild keeps the old node (the plan left the slot empty); boot builds the Phaser
  twice (the default 10 stages, then the seeded count); the T3 "drop the floor" mutant is equivalent because the resolver already
  clamps, so the resolver clamp was mutated instead; `rampOrSet`'s value type widened to `unknown`.
- **The phone gate was not fully run, and no threshold was built.** Task 14 had "some underruns" at Full and no baseline to compare;
  Crawford closed the gate on that evidence, so the gate's "zero underruns at Full" was not met as worded. T15b (`LOAD_PEDAL_MIN`)
  exists only as a conditional plan task. The Stages ceiling stayed at 12.
- **Nothing on the gem reads a pedal**, pinned by the guard test's source scan.
- **Still open:** the lore words; the T0 re-baseline and a Standard run on the Pixel, and the desktop `npm run perf` comparison;
  the underrun count at Full; and the Checkpoint C by-hand check.

## 50.5 Robot Performance: Dynamics, Rests, Accents, Humanize

The per-robot "musicality" half of the Audio Palette, promoted from backlog item 21 (now in
[the archive](archive/backlog-archive.md#21-audio-palette-trials-robot-dynamics-gate-length-humanize-and-rests)). Four controls
that make a robot's playing sound played rather than mechanical, every one **trigger-time arithmetic or melody data**: the phase
adds zero audio nodes and no Audio Load cost. **Dynamics** (per robot, Levels) scales the existing velocity variance — neutral 50 is
today's sound exactly, 0 is flat, 100 is twice the rate and twice the width. **Rests** (per robot, Composition) is a seeded per-event
chance that a note ends early and leaves silence — a shortened note, never a skipped one, which would be anti-Density. **Accents**
(per robot, Composition) is a seeded per-event chance of one of the five classical marks (accent, marcato, staccato, staccatissimo,
tenuto), each a velocity × length pair, unlocked in three tiers. **Humanize** (global, Pacing) lands every note a few milliseconds
off the grid inside `MIN_LEAD`. Seeded fleet-wide, not as minority traits.

**Interviewed 2026-10-15**, intent at [robot-performance.md](../intent/robot-performance.md): three corrections to the backlog's
framing — these are wanted features, not trials; rests shorten rather than skip; accents mean articulation marks, not beat patterns.
Gate length folded into Rests; accent placement patterns, per-robot humanize and the "trial branch" framing dropped.

**Status: built 2026-10-16 on `feature/palette-performance`, PR pending** (intent [robot-performance.md](../intent/robot-performance.md),
spec [ROBOT_PERFORMANCE.md](../specs/ROBOT_PERFORMANCE.md), plan [ROBOT_PERFORMANCE.md](../tasks/ROBOT_PERFORMANCE.md); tasks
T1–T17, T19 and the follow-up T20 committed; guard test `src/docs/robotPerformanceDocs.test.ts`). Crawford listened through
Checkpoints B–E and gave one verdict, "it all sounds good", which accepts every open veto point as built (assumptions 2, 5, 6, 10,
13, 14: the mark tiers and multipliers, the 0.8 baseline, Humanize in the Pacing top row, the seed ranges, the lore words).
**T18's Pixel A/B was not run**, so the phone gate is open, not passed; a desktop `npm run perf` comparison was not run either.
The desktop underruns that interrupted Phase 3 turned out to be a pre-existing rendering load on Crawford's laptop (main reproduced
them; see `docs/PERFORMANCE.md` once that work is written up), not this phase.

### As built (deltas from the paragraphs above)

- **Rests and Accents live on a labelled Articulation panel in the Composition section** (`PingControlsCompositionSection`), not the
  plan's PHRASING panel, which was no longer rendered on any screen. Gated by `disabled` alone.
- **The post-pass is keyed on the seed alone.** `buildSeededPerformance(compositionSeed)` is an `alea` over
  `` `${compositionSeed}:performance` ``; the spec's key carried both slider values, which re-seeded the stream on every tick of a
  slider and broke its own four-draw contract. Four draws per event, always, so each slider re-stamps one concern.
- **The per-note rolls hash the seed (T20).** `compositionSeed` is a 0–1 fraction, so the spec's `(compositionSeed + position) % 97`
  noise-map offset put all twelve robots within one unit of each other on a smooth field: Humanize moved a unison together by ~7 ms
  (Crawford: "I don't hear a change when I max out the slider") and the Dynamics roll was all-or-none across the roster on 51 of 64
  ticks. `performanceRoll(compositionSeed, purpose, position)` — `alea` over `seed:purpose:position` — now feeds the velocity roll,
  its variance and Humanize; the legacy no-position counter keeps the noise map. Measured: cross-robot Humanize spread 13–16 ms
  before, ~34 ms after, at the 20 ms setting.
- **Humanize is pushed, not read.** `AudioEngine.setHumanize(ms)` (the `setPolyphonyCap` precedent); `audioStore.setHumanize` and
  the seed-once branch push it, and a session restore reaches the engine through the same setter. Seeded 2–6 ms by a **uniform**
  draw (`getUniformSeededVal`): the plain draw gave three distinct values over 300 styles. Click-track entries are never humanized.
- **`NOTE_VELOCITY_BASELINE` 1 → 0.8**, so the louder multipliers have headroom (about 2 dB fleet-wide; Volume untouched).
- **Shortened notes are scheduled as seconds** (`NoteParams.duration: NoteDuration | number`), floored at `MIN_SOUNDING_SECONDS`
  (0.03 s) and never longer than the note as written; the composite voice takes the number as a string.
- **Companies broadcast the three robot fields** on `onDensityChange`'s shape; `CompanyOptionsSection` needed no change because T9/T10
  had already wired the handlers through. Humanize is global, so no company field.
- **Persistence:** `RobotAudioOverrideDiff.dynamics / rests / accents` (restored only when finite, key by key) and
  `SessionPayload.humanize`; share-link codes `dy` / `rt` / `ax` and `hm`. The restore's existing `regenerateMelody` re-stamps the
  marks. Payload `version` stays 2. A decoded absent `hm` is a present-but-undefined key, like `sd`.
- **Nothing on the gem reads any of it**, pinned by the guard test's source scan.
- **Still open:** the Pixel A/B at Standard and Full (T18); whether 20 ms is the right Humanize ceiling (`MIN_LEAD` allows up to
  50 before the 50 ms rule breaks — listen again now that the unison smears); the "Dynamics" word's clash with the Audio Load
  panel's use of the word (accepted for now).

## 50.6 Global Pedals: Chorus, Tremolo, Vibrato, Frequency Shifter and Width

Promoted from backlog item 22 ([backlog.md](backlog.md#22-audio-palette-trials-more-global-pedals-to-audition)), the next
item on the Audio Palette menu once 50.1–50.5 had merged (PRs #555–#559). Five more single-instance Tone 15 effects on the
global chain, each one slot in `wireGlobalFxChain` with a Mix, each behind the phone gate. `Chorus` (its own LFO; with
feedback it is a flanger), `Tremolo`, `Vibrato` and `FrequencyShifter` ("strange, and on-brand") are motion pedals on the
dry chain after the Phaser. `StereoWidener` is a Width control whose 0 is a mono fold for a phone speaker. The three with an
internal oscillator are wall-clock (backlog 17's accepted class) and take Free | Sync on their rate
([33](#33-free--sync-toggle)). The backlog's two room *type* radios (PingPongDelay on the Delay row, Freeverb / JCReverb on
the Reverb row) stay in backlog 22. This is a sixth sub-phase; the series header above now says seven, with Robot Effect Sends (50.7).

**Interviewed 2026-10-17**, intent at [global-pedals.md](../intent/global-pedals.md): six questions, one guess overturned
("all eight in one pass" became these five now and the two room radios later). Every parameter on screen; the four motion
pedals as sub-tabs of Modulation and Width as a sub-tab of Output, after the rooms' join; a fresh world lights a pedal or two,
quietly; by hand any pedal goes to its loudest.

**Status: built 2026-10-18 to 2026-10-21 on `feature/pedals`, PR pending** (Crawford opens it; intent
[global-pedals.md](../intent/global-pedals.md), spec [GLOBAL_PEDALS.md](../specs/GLOBAL_PEDALS.md), plan
[GLOBAL_PEDALS.md](../tasks/GLOBAL_PEDALS.md); guard test `src/docs/globalPedalsDocs.test.ts`). Inside it, the
**Dark-Effect Bypass**, built when the first phone run missed (intent [dark-effect-bypass.md](../intent/dark-effect-bypass.md),
spec [DARK_EFFECT_BYPASS.md](../specs/DARK_EFFECT_BYPASS.md), plan [DARK_EFFECT_BYPASS.md](../tasks/DARK_EFFECT_BYPASS.md)).
Tasks T0–T14, T16 and T17 done; T15b (a Mix threshold) was dropped, since a dark effect cost as much as a lit one. Crawford
passed Checkpoints A, B (by ear) and C, the T16 listen ("it sounds fine"; nothing moved), and the branch review's follow-ups by
ear on desktop and phone (2026-10-21: "it all sounds good on desktop and the phone"). The phone gate passed with a caveat, by his
call (below). The paragraph above is the starting point, not what shipped: read "As built" first.

### As built (deltas from the paragraphs above)

- **Five nodes, in two places.** Chorus → Tremolo → Vibrato → FrequencyShifter on the dry chain after the Phaser and before
  the Compressor, so the rooms' tails are never swept; the StereoWidener between the Compressor and the Limiter. Under
  Controlled Decay the returns now join at Width's cell, not the Limiter, so Width hears the rooms in both modes and Width 0
  folds everything to mono. Nothing is per robot, none is an LFO or swell target, and nothing on the gem reads them (guard
  test).
- **Every parameter is a slider**, sixteen in all, as sub-tabs: Modulation has six (AutoWah, Phaser, Chorus, Tremolo, Vibrato,
  Shifter) and Output three (Compressor, Width, Limiter). The four Mixes are tapered like Colour's; Width is not, so 0.5 stays
  unity. The Shift is a centred-zero slider on a signed-log track (`logKnee`, added in the branch review), so the seeded
  ±2–20 Hz band is 28 % of each half rather than under 2 % of a linear ±1 000 Hz track.
- **Three more Free | Sync rates, on one generic rail.** `resolveSyncedRateHz`, `syncedRateToSync`, `syncedRateToFree` and
  `allowedRateNoteValues` over one range (`PEDAL_RATE_RANGE_HZ`), `setPedalSyncMode(key, …)` in the store, and one key list
  (`SYNCED_RATE_KEYS`) that the store, the drawer, the seeder and the session sanitiser loop over. The Phaser moved onto it,
  and its own helpers, `setPhaserSyncMode`, `PHASER_SYNC_ODDS` and the `PHASER_RATE_*` names were deleted in the review.
- **Seeding: at most two Modulation pedals lit, by a sequential cap.** After the AutoWah and Phaser rolls (untouched), each
  motion pedal rolls in chain order under its edge (0.25 / 0.25 / 0.25 / 0.15) and is forced dark once two of the six are
  lit (`MAX_LIT_PEDALS`). Measured over 20 000 styles: Chorus 22.68 %, Tremolo 19.33 %, Vibrato 16.75 %, shifter 8.20 %,
  two lit in 49.38 % of worlds, never three; about half of lit LFO pedals seed Sync. Width has no roll and seeds 0.4–0.65;
  about 4 % of worlds land on exactly 0.5, which is unity, so the widener starts dark (4.36 % of 5 000 styles, measured at
  T17). All draws are uniform. The seed oracles were amended by hand, never re-recorded, and the T16 listen kept every band.
- **The Chorus comes back.** The V2 chain rework had removed one ("the effect isn't correct for this music"); the intent did
  not mention that, and five V2 "no chorus" guards in the tests were inverted as the tasks reached them (T1 to T10).
- **Power-on hung, and two zero-delay cuts fixed it.** Tone's `standardized-audio-context` searches every downstream path on
  each `connect`, stopping only at a delay node, so the paths multiplied stage by stage: with all five pedals the estimate
  was about 14 minutes. Two zero-delay `Delay` nodes in the dry chain (at its entry, and after the HPF) and, since the bypass,
  one at the end of each cell, bound every search. They pass the sound unchanged. `chainCycleSearch.test.ts` is a tripwire on
  the library's behaviour.
- **Some changes could not be ramped, so they duck.** Tone's Chorus Delay and Depth setters step the LFOs' range and click
  (×217 and ×13), so the range is ramped on the LFOs' Scale Signals instead (×1). A Spread on a lit Chorus or Tremolo swaps
  the LFOs' waveform at once (×49–79 and ×7 in a real-time context), and so does a lit Phaser's Stages change (×2–55); both now
  go dry, apply the change from Tone's audio-clock timer once the ramp has run on the audio thread, and come back
  (×1.3 / ×1.6 for the Spread, ×0.82–0.93 for the Stages). A pedal goes dry for about 0.15 s per change.
- **Stereo, corrected in the review.** The spec first said the Vibrato and the shifter were mono. The Vibrato is fully
  stereo; the shifter's sine branch enters an AudioParam and is downmixed, so a hard-panned voice leaks the other sideband.
  Crawford's T16 listen kept it.
- **The Dark-Effect Bypass.** A Tone `Effect` processes its wet path at any Mix, so a dark pedal cost as much as a lit one.
  Now each of the ten global effects (the three Colour effects, the AutoWah and the Phaser from `main`, and the five new ones)
  sits in a four-node bypass cell that carries its Mix on Tone's own equal-power law. At Mix 0 (Width exactly 0.5) the effect
  is disconnected and out of the signal path; every connect and disconnect happens with its wet gain at zero. The `?debug`
  HUD reads ` · fx in n/10`. Measured on the desktop: lit sound unchanged (every difference ≤ 1.8e-7), crossings inaudible
  (worst ×1.19), all ten dark at 38.3 ‰ against 150.6 inline in the same sitting, `perf:audio` below `main` (0.431 / 0.502
  against 0.460 / 0.580), power-on and a Decay flip no slower. Full account: the spec's §8.
- **Persistence.** The five blocks travel whole inside `globalAudio`; payload `version` stays 2 and nothing new is encoded.
  An older payload loads them at the defaults. `sanitizeSyncedRate` (was `sanitizePhaserSync`) drops a bad `sync` on each of
  the four synced blocks. A block of the wrong kind now counts as missing: a crafted `?session=` with `g.chorus: 1` used to
  throw in the sanitiser, and `main` had the same gap for the Phaser and the Delay.
- **Presets stay clean**: every pedal Mix 0, Width 0.5.
- **Copy beyond the spec.** The Modulation intro ends "up to two pedals, or none"; the Output intro gains a Width paragraph,
  and its Decay Mode line says Controlled Decay's echoes have "only Width and the Limiter above them". The lore words (Twin
  Current, Pulse Fade, Line Waver, Band Slip, Spread) are placeholders for the copy pass.
- **The phone gate passed with a caveat, by Crawford's call** (every run in
  [scratchy-audio-phones.md](scratchy-audio-phones.md#global-pedals-roadmap-506-on-the-pixel--t0-and-t14-crawfords-runs-2026-10-19)
  and the sections after it; Pixel 8, Full unless noted, underruns at 3:00, single runs).
  - Round 1: `main` 36 (Standard 59); the branch's worst case, all six Modulation pedals at Mix 1, 92 (Standard 193). A miss.
  - Round 2: the branch with every new pedal dark read 380, then collapsed; `main` 94. The cost was the effects' presence,
    which is what the bypass fixed.
  - Round 3, with the cells: the same dark world 31 against `main`'s 48. Worlds with four and seven effects lit ran away at
    about 3:30.
  - Round 4: four lit read 59 and 53 on a fresh phone. Later runs in the sitting collapsed whatever they carried, including
    `main`'s, run fifth (26 at 3:00, silent at 4:13). That late-sitting collapse is backlog 27.
- **Still open:**
  - The lore words.
  - Backlog 27: the late-sitting collapse on both builds, heat against state not yet separated.
  - What a lit effect costs on the phone. Round 3's lit runs ran away; round 4's on a fresh phone did not. The desktop
    pricing is in scratchy-audio-phones.md; a Phaser at 4 stages showed no signal on the phone.
  - Whether a fresh world should ever seed Width at exactly 0.5 (harmless today: unity either way).
  - Every phone figure above is a single run.

## 50.7 Robot Effect Sends: Grit, Shimmer and Double

Extends Robot Sends ([50.2](#502-robot-sends-per-robot-reverb-and-delay-depth)) to three of the global effects 50.3 and 50.6
put on the chain. Each robot gets three more sends: Grit into a Colour room (Distortion, Chebyshev, BitCrusher), Shimmer into
the Frequency Shifter and Double into the Chorus, so a few robots are coloured, ringing or doubled instead of the whole
fleet. It grew from the Tone.js effects inventory ([TONE_EFFECTS_INVENTORY.md](../reference/TONE_EFFECTS_INVENTORY.md),
2026-10-19): which global effects should the robots send into, and which should stay inserts. The names are working
titles until the copy pass.

**Interviewed 2026-10-21**, intent at [robot-effect-sends.md](../intent/robot-effect-sends.md): six questions, five guesses
confirmed, per-robot delay time deferred to a phase of its own. **The Classic Band Retune came first** (above), as its own
task and listen before T1, since the room bands are written against its merged numbers (PR #567, `2dc5b4a2`).

**Status: built 2026-10-21 to 2026-10-22 on `feature/robot-effect-sends`, PR pending** (Crawford opens it; spec
[ROBOT_EFFECT_SENDS.md](../specs/ROBOT_EFFECT_SENDS.md), plan [ROBOT_EFFECT_SENDS.md](../tasks/ROBOT_EFFECT_SENDS.md); guard
test `src/docs/robotEffectSendsDocs.test.ts`). Tasks T0–T22 done. Crawford passed Checkpoints A, B and C, the T20 listen ("i
think everything sounds fine"; no tuning) and the T21 phone gate.

### As built (deltas from the paragraphs above)

- **Three rooms beside the chain, no new effect nodes.** Each is the 50.6 bypass cell without its dry path: a shared `in`
  that every robot's send feeds, one wet-only branch per effect, a zero-delay cut and a return gain, joining where the Reverb
  and Delay returns join. The dry chain shrinks to seven stages after the filters (AutoWah, Phaser, Tremolo, Vibrato,
  Compressor, Width, Limiter); the Vibrato stays an insert. A branch is in the signal path only while some reserved robot
  sends into its room, the room's Return is above 0 and the branch's own level is above 0, through the 50.6 crossing, so a
  dark room costs what a dark effect costs. The HUD's ` · fx in n/10` counts chain cells and room branches alike.
- **No Colour master Return** (Crawford, 2026-10-21, after seeing it built as a Room sub-tab at T17). Each colour Mix is
  already a wet-only level on its own branch, so it acts like the Reverb or Delay Amount; the Room tab, its settings block
  and its setter were removed (T17.1, T17.2). The Chorus and Shifter Mixes became their rooms' Returns: they read
  "Return", default to 1 and are not seeded.
- **Per robot:** three more 0–100 % sliders after Delay in the Levels block on the robot and company screens, three more
  seeded fields that save, share (`gr` / `sm` / `db`) and bulk-edit like Reverb and Delay, and three more swell attributes
  (22 in the pool). Nothing on the body reads them.
- **Seeding.** The five send bands moved into one table, `ROBOT_SEND_LOADING_RANGES`, that a theme can override; Reverb
  and Delay seed byte for byte as before. A fresh robot carries at most one of Grit (0.4–0.8, lit 0.21), Shimmer (0.2–0.5,
  0.16) and Double (0.3–0.6, 0.19): about 2.5, 1.6 and 1.6 robots per fleet of twelve. The Chorus and the shifter lost
  their lit rolls, so the two-pedal cap now counts four (Tremolo 22.04 %, Vibrato 19.55 %), and the Chorus rolls Sync in
  every world. A Grit send is heard only in a world whose Colour character lit an effect.
- **Found and fixed on the way.** A voice replaced by a re-reservation must leave the feeder sets (T5). A share link's
  sends were inaudible: the rooms were built unfed after robots had already joined the sets, so `loadInstruments` now
  tells each new room where its set stands (Checkpoint C, `bd8c2ae6`). The build makes ten zero-delay cuts, not the
  spec's fifteen.
- **Measured** ([scratchy-audio-phones.md](scratchy-audio-phones.md#robot-effect-sends-roadmap-507-desktop--t19-2026-10-21)
  and the section after it). Every room crossing ×0.84–×1.29; an all-dark `perf:audio` 0.466 / 0.547 against the base's
  0.467 / 0.561; power-on, a Decay flip and a send crossing no slower. A connect sometimes loses one render quantum in
  headless Chrome, 50.6's cells included (backlog 29); Crawford heard no tick. Pixel 8, off for 20 minutes before every
  run: at 3:00 the branch read 76 / 62 / 59 against the base's 48 / 68 / 95. One branch run collapsed after 3:30 and its
  repeat did not, and a world with all seven effects lit held (backlog 27).
- **Still open:** the lore words; the room-depth second look at the colour Mix bands (spec §7 Q1, not taken at the
  listen); backlogs 27 and 29; per-robot delay time (its own phase); themes, which now have the send table to override;
  the five sends written out field by field across the code ([55](#55-robot-sends-one-table-for-the-five-sends), next up).

## 52. Job Decorations (six small animations on the orbiters' work)

Intent [docs/intent/job-decorations.md](../intent/job-decorations.md), spec
[docs/specs/JOB_DECORATION.md](../specs/JOB_DECORATION.md), plan
[docs/tasks/JOB_DECORATION.md](../tasks/JOB_DECORATION.md), sketch
[docs/sketches/job-decorations.html](../sketches/job-decorations.html) (Verdict 1, 2026-10-12: all six rows kept at
Crawford's settings). **Built on `feature/job-decorations`, 2026-10-12 to 2026-10-13 (Tasks 1–14 and 16); not yet
merged.** The idle-paint perf gate (Task 14) **missed** — busy +11 %, paint +18.5 % against the branch's merge
base, every run outside the parent's spread — and Crawford accepted it (docs/PERFORMANCE.md, "Job Decorations — the
Task 14 perf gate"). **Still owed: Task 15** — the Pixel listen at Full with a working fleet, which was **not run**
(Crawford could not test on 2026-10-13 and asked to continue) — then the PR. Crawford said "everything looks good
so far" of the live build while it was made; Checkpoint C's formal verdicts were not written into the sketch.

### About

While a robot works, its job gains one decoration drawn over the orbiters: tethers and motes (Vent Extraction),
ping arcs and a wired ring (Acoustic Survey), a scan trail and vertex ticks (Structural Inspection), droplets and
a spinning valve (Fluid Monitoring), a wired load (Salvage), sparks and a flash (Maintenance). Each is a pure
state module plus a builder that makes its SVG nodes once, in a `<g class="robot__work">` appended to the robot's
`.robot__row`, and removes them when the job ends or is killed. As built, in
[ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md#job-decorations).

**Decisions.**

- **Six rows kept, at Crawford's numbers** — he went bigger than the brief's "small", and the sketch's defaults are
  the constants.
- **Variation is fixed per robot**, ±15 % on twelve size and timing factors, drawn from the end of the
  `${gemSeed}:work` stream so no existing draw moved. Counts and opacities never vary.
- **Decorations live in the robot's row frame**, so they scale with the back row and unmount with the robot.
- **Writes run from the job timeline's `onUpdate`**, not one tween per decoration, so an orbiter's live position
  is current when a wire reads it; cleanup wraps `tl.kill` because `onInterrupt` misses the silent finish.
- **The tier ladder ships unbound.** `decorTier(robotLoad)` is plumbed through the work loop and every preset
  draws everything; Full is always `'all'`, so binding the ladder could never lower the Full-tier cost.

### Not Doing (and why)

- **Cards and the detail avatar** — decorations are world animation; the cards keep their still body.
- **Per-run or audio-driven variation** — a robot should work the same way each job, and the Visual Mapping
  guardrail keeps audio out of the body.
- **Changing move timing** — the moves, `moveWindows` and `jobDuration` are untouched.
- **Binding the tier ladder now** — the perf miss was at Full, which the ladder cannot reach; revisit only if the
  Pixel run shows a problem at Standard or Light.
- **A battery dim** — decorations play only while Active, never critical.
- **New dependencies** — GSAP and `createElementNS` only.

### Open

- The Pixel listen (Task 15), at Full with a working fleet.
- Spec questions 1, 2, 3 and 5 (battery dim, identity colour, count 1, droplet numbers) shipped as the spec
  proposed them and were not separately confirmed by Crawford.
- If the Pixel shows trouble: cut the Full-tier cost (skip unchanged attribute writes, or fewer nodes at `'all'`).

## 53. Per-Mover Compositor Layers

Intent [docs/intent/per-mover-compositor-layers.md](../intent/per-mover-compositor-layers.md), spec
[docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md](../specs/PER_MOVER_COMPOSITOR_LAYERS.md), plan
[docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md](../tasks/PER_MOVER_COMPOSITOR_LAYERS.md); diagnosis in
[backlog item 26](backlog-archive.md#26-desktop-paint-stage-sized-moving-layers-re-raster-every-frame) and
[PERFORMANCE.md](../PERFORMANCE.md#desktop-full-screen-underruns-are-raster-bound-2026-10-16). **Built on
`perf/per-mover-layers`, 2026-10-16 to 2026-10-17 (Tasks 1–23); not merged** (the PR is Crawford's). The Task 20
idle-paint gate **MISSED its headline criterion**: median `screens/frame` 0.95 against `main`'s 3.10 is 0.31 × `main`,
and the limit was 0.25. Busy time (2295 against 2749 ms), Paint time (128 against 246 ms) and layer memory (24.2
against 37.8 MB) were within their limits. The work the phase targeted fell by over 90 % (about 2.07 to about 0.16
screens/frame); what keeps the total above the line is the document layer, which repaints a full viewport on nearly
every frame on both builds, cause unidentified. The run was stopped and not acted on. The Pixel listen (Task 21) ran
2026-10-17: Full Audio Load, over five minutes, about 12 underruns, no distortion, no clipping, Crawford: "good to
go"; no `main` count was taken, so the plan's not-above-`main` criterion is open. Checkpoints B and C (Crawford's
look, Chrome and Firefox) were never recorded as passed; he proceeded on the automated checks and the Pixel listen.
Numbers: PERFORMANCE.md, "Per-Mover Compositor Layers — the Task 20 gate" and "the Task 21 Pixel listen".

### About

Chrome composites a whole `<svg>`, so the four stage-sized sheets that carried the robots, bubbles and marker were each
repainted in full whenever one robot moved, and the cost grew with the screen. The scene is now one scaled stage
(`sceneFit`, `useStageFit`) holding four static sheets and one small mover per robot, per bubble stream, for the
marker and for a row switch's dissolve copy. A swim slides a layer and repaints nothing; only a change inside a mover
repaints, and only its own patch. A robot changes rows by a slot write (`data-scene-slot`, `SCENE_SLOTS`), not a
React re-mount, so the re-mount machinery is gone. Nothing a viewer sees changes. The idle-paint harness gained a
redrawn-area metric (`redrawn px²/frame`, `screens/frame`) with each paint clamped to its layer, and a mover-layer
readout. As built, in [ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md#scene-stack--the-stage-the-sheets-and-the-movers).

**Decisions made while building.**

- **Hairline softness accepted.** A promoted mover under the scaled stage draws hairlines slightly softer than direct
  vector (measured in Chrome 155); Crawford looked at the spike page in Chrome and Firefox on 2026-10-17 and said it
  looks fine. No snapping or promote-only-while-moving mitigation was built.
- **The swim pivots about the gem canvas centre** (the mover's centre), not the old bounding-box centre.
- **The paint-area metric needed a prerequisite the plan did not list.** A `Paint` event's clip is a cull rect, and a
  promoted mover's is unbounded, so each `Paint` is clamped to the layer it drew into (Task 20's prerequisite).
  `main` re-measured under it reads 3.10, not the baseline's 4.63.
- **Bubble strips are always promoted**, one per stream, as specified.
- **The swim timeline is created before the dissolve's**, because GSAP updates in creation order and the copy mirrors
  the body in the dissolve's update.

### Not Doing (and why)

- **The audio-headroom default** (the Standard Audio Load preset, `?latency=playback`) — mitigation, not cause, and
  Crawford's call.
- **Machine-side fixes** (routing Chrome onto the discrete GPU) — they help one machine, not anyone else.
- **The re-mount path** and the `<use>`-inside-a-sheet dissolve — removed, not kept for its own sake; pre-v1 keeps
  nothing because it was how it was.
- **Any look change** — the world, the marker and its caption are as they were.
- **Per-station sheets** — the fallback for a ripple-driven paint miss; the static sheets paint 3–23 times in 6 s, so
  the miss is not that.
- **Amending the gate after the result** — a criterion changed after its run is a stated decision, and none was made.

### Open

- **The document layer's repaint** (a full viewport on 279–345 of about 350 frames on both builds): Crawford's call
  between accepting the criterion against it and filing the repaint as its own item, fixing it and re-running the gate
  unchanged, or amending the criterion to exclude it from both sides.
- **The Pixel `main` comparison**: no `main` listen was taken in the same session, so the listen is a clean branch
  listen, not an A/B.
- **Bubble strips' memory**: no strip was a drawing layer in the idle window, so spec §7 Q3 (fifty always-promoted
  strips against the one sheet they replaced) is untested by the gate.
- **Checkpoints B and C, and Safari**: Crawford's manual list was never signed off in Chrome and Firefox, and Safari
  is unverified.

## 55. Robot Sends: One Table for the Five Sends

Raised at the Robot Effect Sends ([50.7](#507-robot-effect-sends-grit-shimmer-and-double)) code review, 2026-10-22, and put
next on the roadmap by Crawford the same day. A refactor with no change in behaviour: the five per-robot sends (Reverb,
Delay, Grit, Shimmer, Double) are written out one field at a time in about fifteen places, so a sixth send, or a change to
how a send is primed, means finding every copy by hand. The paragraphs below are the starting point, not what shipped:
read "As built" first.

**Status: built 2026-10-22 on `refactor/robot-send-table`, off `main` at `608c5b92` (the 50.7 merge), PR pending**
(Crawford opens it; intent [robot-send-table.md](../intent/robot-send-table.md), spec
[ROBOT_SEND_TABLE.md](../specs/ROBOT_SEND_TABLE.md), plan [ROBOT_SEND_TABLE.md](../tasks/ROBOT_SEND_TABLE.md); oracle
`src/systems/robotSendsParity.test.ts`). Tasks T1–T15 done. Crawford passed Checkpoint A (a smoke listen) and Checkpoint B
(both screens' Levels block unchanged); the closing listen, the code review and the PR remain.

### About

Where the copies are (checked against the code at `b96304f5`):

- **The prime, four times.** `{ reverb: robot.reverbSend, delay: …, grit: …, shimmer: …, double: robot.doubleSend }` is
  spelled out at every reservation site: `loadInstruments`' post-load pass and `reReserveVoice` (`AudioEngine.ts`),
  `spawnRobot` and `reRegisterAllRobotsAudio` (`spawnSystem.ts`). Only a regex source scan
  (`src/engine/reservationSendsPrime.test.ts`) stops a site from missing a key.
- **The field list, four times.** `ROBOT_SEND_FIELDS` (`robotSendLoadingRanges.ts`) exists but only its type is read;
  `localeStore.ts`'s clamp loop, `audioSwells.ts`'s `SEND_ATTRIBUTES` and `sessionDiff.ts`'s `SEND_PRIME_KEYS` (field to
  `updateRobotSends` key) each carry their own copy.
- **The actions, ten functions.** `applyReverbSend` … `applyDoubleSend` and their five `*Value` forms
  (`robotOptionsActions.ts`) differ only in the field and the engine key; `audioSwells.ts`'s `writeRobotSend` is a five-way
  switch over them.
- **The screens, ten handlers.** Five `handle*SendChange` in `RobotScreen.tsx` and five `on*SendChange` in
  `useCompanyOptions.ts`, each beside its own swelling flag. `AudioSettingSection` takes five value / handler / swelling
  sets and renders five rows from five near-identical schemas (`REVERB_SEND_SCHEMA` … `DOUBLE_SEND_SCHEMA`,
  `robotOptionsConfig.ts`), and `CompanyOptionsSection.tsx` passes them all through.
- **The engine.** `reserveVoice` builds the five send gains one by one, twice (the live voice and the stub fallback), and
  `updateRobotSends` writes Reverb and Delay one way and the three room sends in a loop.
- **The share codec.** `sessionShareUtils.ts` maps `rs` / `ds` / `gr` / `sm` / `db` in and out, five lines each way.

The shape the review proposed, to be settled at the spec: one table beside `ROBOT_SEND_FIELDS` mapping each field to its
engine key (and perhaps its share code, schema and content key); a `robotSendLevels(robot)` helper that the four
reservation sites call, which leaves the regex scan nothing to guard; and one `applySendValue(robot, localeId, field,
fraction)` that the actions, the swell tick and both screens go through.

### As built (deltas from the paragraphs above)

- **One table, in a new module.** `ROBOT_SENDS` in `src/data/robotSends.ts` has one row per send: the `Robot` field, the
  key `updateRobotSends` takes, the share code (`rs` / `ds` / `gr` / `sm` / `db`) and the slider's content key, written as
  a literal because the content guard finds a key by its quoted text. `ROBOT_SEND_FIELDS` moved here from
  `robotSendLoadingRanges.ts`; the seeding bands stayed there, since they are tuning, not wiring. The table's order is the
  old order (Reverb, Delay, Grit, Shimmer, Double), and every loop runs in it.
- **Two key spaces, one mapping.** The engine speaks `SendEngineKey` (`reverb`, `delay`, `grit`, `shimmer`, `double`);
  robots, screens, the store, the swell tick and persistence speak `RobotSendField`. `engineKeyOf` is the only translation,
  one way (the spec's inverse, `sendFieldOf`, had no caller and was deleted at review).
- **What iterates it.** The four reservation primes (`robotSendLevels(robot)`); the voice's send gains (`VoiceEntry`'s
  `sends` record, built, connected and disposed in a loop); `updateRobotSends`, which now takes
  `Partial<Record<SendEngineKey, number>>`; the swell tick; the swell ranges, the swell pool's tail, the store clamp and the
  company fallbacks; the session diff's loops; the share codec, at the place the five lines held, so a link's string is
  byte for byte the same; and both screens' rows.
- **Ten actions became one pair**, `applySend` / `applySendValue(robot, localeId, field, …)`. The ten named actions were
  deleted, not kept as wrappers (T14). The swell tick's `writeRobotSend` switch and its `SEND_ATTRIBUTES` list went at T7,
  and `sessionDiff.ts`'s `SEND_PRIME_KEYS` at T9.
- **Screens.** `AudioSettingSection` takes `onSendChange(field, pct)` and a `sendSwelling` record, and renders one memo'd
  `SendRow` per table row from `ROBOT_SEND_SCHEMAS` (the five named schemas are gone). `RobotScreen` and
  `useCompanyOptions` each have one handler and read the five flags through `useSendSwellingFlags`, which re-reads every
  render (two `RobotScreen` cases pin that a flag flip on an unrelated render must arrive). For three commits (T10–T12) the
  section took either the new pair or the old five handlers, as a type union, so no screen could leave a row unwired during
  the move; T13 removed the old ones.
- **The parity oracle.** `src/systems/robotSendsParity.test.ts` was recorded at the branch base before the first refactor
  commit and never re-recorded (one commit). It pins two seeds' sends, every `updateRobotSends` call sequence (spawn,
  re-registration, re-reserve, session restore, share link, a swell landing on a send), the share string, the store clamp
  and the swell pool, with non-default fixture values. It stayed green through every task; the full suite was the second
  check.
- **The regex reservation scan is deleted** (`reservationSendsPrime.test.ts`), one task early, at T4 not T5: its
  literal-argument reader went red once the engine primes stopped being literals. Guard rows pinning
  `robotSendLevels(robot)` at all four sites replace it.
- **The docs guards.** Each task that moved a pinned symbol re-pinned its row in `robotSendsDocs` / `robotEffectSendsDocs`,
  and every deleted name joined their `NOT_REPO_SYMBOLS` (the `SEND_DELAY_QUIET_THRESHOLD` precedent), because the two
  historical specs' §1–4 still cite them; those specs carry a header note instead of edits. Both guards assert the ten
  actions are not identifiers in `src/`, and `robotSendsDocs` asserts no living doc names any deleted symbol. Two more
  guards (`robotPanDocs`, `robotArticulationDocs`) read send names on their own scanned lines and carried temporary entries
  from T13 and T14 until T15 rewrote those doc lines.
- **No Pixel A/B and no `perf:audio` run**: the graph is the same nodes, connections and ramps (spec assumption 13).

### Not Doing (and why)

- **Any change in behaviour.** No seeded value, saved diff, share code, slider, swell pick or sound moves; the existing
  suite is the parity check. **Held**, with a dedicated parity oracle in front of the suite (As built).

### Open

- **Answered: they go.** Whether the named actions (`applyGritSend` and the rest) stay as one-line wrappers or go. About
  70 test references in seven test files spy on them by name, and the two docs guards (`robotSendsDocs`,
  `robotEffectSendsDocs`) pin them in the living docs. All ten were deleted; the tests assert `applySend` /
  `applySendValue` and their `field` argument (spec assumption 5).
- **Answered: one handler and one flag record.** Whether `AudioSettingSection` takes one list of send rows in place of the
  five value / handler / swelling sets, or keeps its props and only the handlers are shared. It takes `onSendChange(field,
  pct)` and `sendSwelling`, and renders the rows from the table; its value prop keeps five named fields (spec assumption 6).
- **Answered: yes.** Whether `Robot`, `RobotAudioBaseline`, `RobotAudioOverrideDiff` and `CompanyOptionsSnapshot` keep five
  named fields (the session format and the company snapshot read them by name); likely yes. They do, as do
  `CompactRobotOverrideDiff` and `AudioSettingValue`; only the code that copies between them iterates (spec assumption 8).
