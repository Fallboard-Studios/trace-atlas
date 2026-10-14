# Roadmap

Completed and cut phases have been moved to [docs/todo/archive/roadmap-archive.md](archive/roadmap-archive.md) to keep this file focused on what's still open. Phase numbers are never reused or renumbered when a phase moves — every cross-reference from specs/tasks/intent docs and from this file's own internal links stays valid whichever file a phase currently lives in.

## 0. LFO integration

**Done — Tone.js LFO engine (`src/engine/lfoEngine.ts`) and modulation types shipped; foundational work predating this doc's `**Done**`-stamp convention.**

## 1. Architecture & Components

**Done — Design System foundation (`ControlSchema`, `src/data/`, `src/components/ui/`) shipped; foundational work predating this doc's `**Done**`-stamp convention.**

## 2. Layout

**Done — mobile-first app shell, sticky transport/metadata bar, and planet-size-derived time shipped; foundational work predating this doc's `**Done**`-stamp convention.**

## 3. Hub

**Done — data-driven Hub Nav (Audio Rig / Sector Settings / Robot Selection tiles) shipped; the hub-nav model itself was later fully replaced by [Phase 22](#22-navigation--layout-rewrite)'s Navigation & Layout Rewrite.**

## 4. Audio Rig

**Done — `AudioRigDrawer` with all global effect blocks, live-wired to `AudioEngine`/`lfoEngine`, shipped.**

## 5. Sector Settings

**Done — `SectorSettingsDrawer` (Planet Calibration / Plot Tuning) shipped; the noise dead-zone Known Issue below was resolved via `LOCALE_SEED_DECOUPLING`.**

## 6. Robot Melody & Seed Engine

**Done — see [docs/specs/ROBOT_MELODY_SEED_ENGINE.md](../specs/ROBOT_MELODY_SEED_ENGINE.md).**

## 7. Robot Systems Engine

**Done — see [docs/specs/ROBOT_SYSTEMS_ENGINE.md](../specs/ROBOT_SYSTEMS_ENGINE.md).**

## 8. Robot Selection

**Done — see [docs/specs/ROBOT_SELECTION.md](../specs/ROBOT_SELECTION.md).**

## 9. Robot Options

**Done — see [docs/specs/ROBOT_OPTIONS.md](../specs/ROBOT_OPTIONS.md) and [docs/tasks/ROBOT_OPTIONS.md](../tasks/ROBOT_OPTIONS.md), plus post-launch fixes.**

## 10. Companies

**Done — see [docs/specs/COMPANIES.md](../specs/COMPANIES.md) and [docs/tasks/COMPANIES.md](../tasks/COMPANIES.md).**

## 10.1 Attenuation Style (single-planet reskin)

**Done — see [docs/specs/ATTENUATION_STYLE.md](../specs/ATTENUATION_STYLE.md) and [docs/tasks/ATTENUATION_STYLE.md](../tasks/ATTENUATION_STYLE.md).**

## 10.2 LFO Modulation Engine (Stacked LFO Drift)

**Done — see [docs/specs/LFO_DRIFT.md](../specs/LFO_DRIFT.md) and [docs/tasks/LFO_DRIFT.md](../tasks/LFO_DRIFT.md); superseded in shape (not scope) by 10.3's 4-group reshape.**

## 10.3 LFO Modulation Engine — Multi-Group Drift

**Done — see [docs/specs/LFO_DRIFT_GROUPS.md](../specs/LFO_DRIFT_GROUPS.md) and [docs/tasks/LFO_DRIFT_GROUPS.md](../tasks/LFO_DRIFT_GROUPS.md).**

## 10.4 Attenuation Style Internal Rename

**Done — see [docs/specs/ATTENUATION_STYLE_RENAME.md](../specs/ATTENUATION_STYLE_RENAME.md) and [docs/tasks/ATTENUATION_STYLE_RENAME.md](../tasks/ATTENUATION_STYLE_RENAME.md).**

## 10.5 Company Assignment: Select → RadioButton

**Done — see [docs/specs/COMPANY_ASSIGNMENT_RADIO.md](../specs/COMPANY_ASSIGNMENT_RADIO.md) and [docs/tasks/COMPANY_ASSIGNMENT_RADIO.md](../tasks/COMPANY_ASSIGNMENT_RADIO.md).**

## 11. Console Theming — Cut

**Cut at Crawford's call after being fully implemented and evaluated — see [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md) for the full retrospective.**

## 11.1.1 Oblique Cabinetry: Foundation & Button

**Done — see [docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md](../specs/OBLIQUE_CABINETRY_FOUNDATION.md) and [docs/tasks/OBLIQUE_CABINETRY_FOUNDATION.md](../tasks/OBLIQUE_CABINETRY_FOUNDATION.md).**

## 11.1.2 Oblique Cabinetry: Toggle

**Done — see [docs/specs/OBLIQUE_CABINETRY_TOGGLE.md](../specs/OBLIQUE_CABINETRY_TOGGLE.md) and [docs/tasks/OBLIQUE_CABINETRY_TOGGLE.md](../tasks/OBLIQUE_CABINETRY_TOGGLE.md).**

## 11.1.3 Oblique Cabinetry: SliderLinear (Voxel-Track Foundation)

**Done — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md](../specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_LINEAR.md](../tasks/OBLIQUE_CABINETRY_SLIDER_LINEAR.md).**

## 11.1.4 Oblique Cabinetry: SliderLog

**Done — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md](../specs/OBLIQUE_CABINETRY_SLIDER_LOG.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_LOG.md](../tasks/OBLIQUE_CABINETRY_SLIDER_LOG.md).**

## 11.1.5 Oblique Cabinetry: SliderCenteredZero

**Done — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md](../specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md](../tasks/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md).**

## 11.1.5.1 Oblique Cabinetry: SliderLinear vertical box verification

**Done — one real bug found and fixed (`CabinetBox`'s left-face wall height); see [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md)'s "Voxel-track sliders" section.**

## 11.1.5.2 Oblique Cabinetry: SliderLog vertical box verification

**Done — same shared fix as 11.1.5.1, verified against `SliderLog`'s real vertical consumers; no `SliderLog`-specific issues found.**

## 11.1.5.3 Oblique Cabinetry: SliderCenteredZero vertical box verification

**Done — same shared fix as 11.1.5.1, verified against `SliderCenteredZero`'s real vertical consumers; no correction needed.**

## 11.1.6 Oblique Cabinetry: RadioButton

**Done — see [docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md](../specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md), [docs/tasks/OBLIQUE_CABINETRY_RADIO_BUTTON.md](../tasks/OBLIQUE_CABINETRY_RADIO_BUTTON.md), and [docs/intent/oblique-cabinetry-radio-button.md](../intent/oblique-cabinetry-radio-button.md).**

## 11.1.7 Oblique Cabinetry: AccordionContainer

**Done — see [docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md](../specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md), [docs/tasks/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md](../tasks/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md), and [docs/intent/oblique-cabinetry-accordion-container.md](../intent/oblique-cabinetry-accordion-container.md).**

## 11.1.8 Oblique Cabinetry: Select — Cut

**Cut before any implementation began — `Select` itself was removed by [10.5](#105-company-assignment-select--radiobutton), leaving no trigger to wire into Cabinetry.**

## 11.1.9 Oblique Cabinetry: TextInput / CoordsInput

**Done — see [docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md](../specs/OBLIQUE_CABINETRY_TEXT_INPUT.md), [docs/tasks/OBLIQUE_CABINETRY_TEXT_INPUT.md](../tasks/OBLIQUE_CABINETRY_TEXT_INPUT.md), and [docs/intent/oblique-cabinetry-text-input.md](../intent/oblique-cabinetry-text-input.md). Closing stamp added 2026-09-27; confirmed shipped on `main` via `599ea19`.**

## 12. Font Sizes: App-Wide Type Scale

**Done — see [docs/intent/type-scale.md](../intent/type-scale.md), [docs/specs/TYPE_SCALE.md](../specs/TYPE_SCALE.md), and [docs/tasks/TYPE_SCALE.md](../tasks/TYPE_SCALE.md). Merged via PR #457.**

## 13. Bug: Vertical Slider Label Overflow

**Done — confirmed shipped on `main`; fixed by switching vertical slider `overflow-y` from `auto` to `hidden`.**

## 14. Visual Identity: Color Scheme & Trait-Based Theming

**Done — see [docs/intent/color-scheme-trait-theming.md](../intent/color-scheme-trait-theming.md), [docs/specs/COLOR_SCHEME_TRAIT_THEMING.md](../specs/COLOR_SCHEME_TRAIT_THEMING.md), and [docs/tasks/COLOR_SCHEME_TRAIT_THEMING.md](../tasks/COLOR_SCHEME_TRAIT_THEMING.md).**

## 15.1 Component: SliderLinear Read-Only Mode

**Done — see [docs/specs/SLIDER_LINEAR_READ_ONLY.md](../specs/SLIDER_LINEAR_READ_ONLY.md).**

## 15.2 Redesign: Robot Cards

**Done — see [docs/specs/ROBOT_CARDS_REDESIGN.md](../specs/ROBOT_CARDS_REDESIGN.md) and [docs/intent/robot-cards-redesign.md](../intent/robot-cards-redesign.md).**

## 16. Redesign: Company CRUD Area

**Done — narrower scope than originally drafted (Company Section Enhancements + Company CRUD Button Preview + 10.5's Select→RadioButton swap); see [docs/specs/COMPANY_SECTION_ENHANCEMENTS.md](../specs/COMPANY_SECTION_ENHANCEMENTS.md) and [docs/specs/COMPANY_CRUD_BUTTON_PREVIEW.md](../specs/COMPANY_CRUD_BUTTON_PREVIEW.md).**

## 15.3 Redesign: Robot Detail Top Card

**Done — see [docs/intent/robot-detail-top-card-redesign.md](../intent/robot-detail-top-card-redesign.md), [docs/specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md](../specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md), and [docs/tasks/ROBOT_DETAIL_TOP_CARD_REDESIGN.md](../tasks/ROBOT_DETAIL_TOP_CARD_REDESIGN.md).**

## 17.1 Styling Overhaul: Sleeve / Tablet-Off State

**Done — styled directly by Crawford, confirmed 2026-09-27; no separate spec pass. See [docs/todo/archive/roadmap-archive.md#171-styling-overhaul-sleeve--tablet-off-state](archive/roadmap-archive.md#171-styling-overhaul-sleeve--tablet-off-state).**

## 17.2 Styling Overhaul: Console Hub (No View Selected)

**Done — superseded rather than built as originally scoped, confirmed by Crawford 2026-09-27. See [docs/todo/archive/roadmap-archive.md#172-styling-overhaul-console-hub-no-view-selected](archive/roadmap-archive.md#172-styling-overhaul-console-hub-no-view-selected).**

## 17.2.1 Performance: View-Switch Profiling Harness & Baseline

**Done — see [docs/PERFORMANCE.md](../PERFORMANCE.md). Implemented on `bug/view-change-slowdown`, merged via PR #484.**

## 17.2.2 Performance: Lazy-Mount Collapsed Accordion Content

**Done — see [docs/specs/ACCORDION_LAZY_MOUNT.md](../specs/ACCORDION_LAZY_MOUNT.md) and [docs/tasks/ACCORDION_LAZY_MOUNT.md](../tasks/ACCORDION_LAZY_MOUNT.md). Merged via PR #484.**

## 17.2.3 Performance: CabinetBox Mount-Time Layout Thrash

**Never built — mooted by [Phase 22](#22-navigation--layout-rewrite)'s Navigation & Layout Rewrite, whose one-node-mounted-at-a-time content model sidesteps this class of problem by construction.**

## 17.2.4 Performance: Audio Scheduling Headroom (Tone lookAhead)

**Closed without building, 2026-09-27 — confirmed by Crawford.** No longer needed: the Audio Load Budget's (17.2.6) `latencyHint` preset switch already covers the "reduce audible dropouts on a slow device" goal this item was scoped for. Raising `lookAhead` itself was never implemented. See [docs/todo/archive/roadmap-archive.md#1724-performance-audio-scheduling-headroom-tone-lookahead](archive/roadmap-archive.md#1724-performance-audio-scheduling-headroom-tone-lookahead).

## 17.2.5 Performance: Idle Paint & Composite Cost

Requested by Crawford, 2026-09-18 — last of the 17.2.1–17.2.5 series (see 17.2.1). High priority for the phone.

**Localized and fixed on desktop, 2026-10-02 (branch `perf/idle-paint`, unmerged as of writing); the real-phone confirmation is with Crawford.** See [docs/PERFORMANCE.md](../PERFORMANCE.md) "Idle paint & composite — roadmap 17.2.5" for the method, the ablation tables and the keep/revert ledger. A new harness, `npm run perf:idle` (`scripts/perf/idle-paint.mjs`), traces the idle blank hub in one Chrome session and re-traces it with one suspect switched off at a time, plus Chrome's own invalidation reasons per node. It found the whole ocean scene repainting at full viewport size on every frame, for two independent reasons: the `fill 4.8s` CSS transition on every lighting-driven factory fill (lightness steps every ~2 s, so some fill was always mid-transition, and a running transition style-invalidates its element every frame), and the robots and bubbles moving inside the same `<svg>` as the sixty static factories (any transform write re-rasterized them all). Fix 1 removes `FILL_TRANSITION`; fix 2 splits `OceanScene` into four stacked layers (static back, moving bubbles, moving robots, static front) with the moving ones promoted to compositor layers, moving bubbles out of `Factory.tsx` into `BubbleLayer`. Unthrottled, 6 s idle window: main-thread busy 3229 → 1672 ms, paint 1006 → 147 ms. A third change (robots as individually composited HTML elements) measured inside noise and was reverted, as the ledger records. The flicker overlay, rocker pulse and gradient rects were ruled out. What remains at idle is the robots' own per-frame cost (~0.8 s per 6 s) and the JS tick work the 17.2.1 profile already noted — not paint.

Visible change for the checkpoint: factory lighting now steps once a second with no fade (a 1 % lightness step, imperceptible by design), and every building's bubbles rise behind the robots and below the foreground row (Crawford's call after the first look: foreground-row bubbles used to pass in front of the robots).

Measured with nothing open at 4× throttle (blank hub, powered on, 6 s window): the main thread was ~84% busy at idle — ~5.0 s of "(program)" (native browser work, not JavaScript) out of a ~6.0 s window. The layout trace attributes most of it to paint and compositing rather than script: `LocalFrameView::RunPaintLifecyclePhase` ~3.1 s, `Paint` ~2.2 s, and `PaintArtifactCompositor::Update` ~1.8 s (compositor commit, which grows with layer count) across ~117 frames. Something in the always-visible scene repaints or re-layers every frame; JavaScript in the same window was small (GSAP ticker and React work under ~1.5 s combined). Suspects to check, none confirmed: the animated robot SVGs in `WorldView` (per-frame `setAttribute`/transform writes), the ocean scene's gradients/filters/shadows, the full-viewport `.screen-viewport::before` stripe overlay with its `bridgeFlicker` animation in `ScreenViewport.css` (opacity-only, so probably compositor-cheap, but its large gradient and `box-shadow` are worth ruling out), and the number of promoted compositing layers. Two further leads from 17.2.1's idle CPU profile (see `docs/PERFORMANCE.md`): the audio-swell tick (`tickAudioSwells` → `advanceActiveSwells` → `writeRobotValue` in `src/systems/audioSwells.ts`, scheduled on a `16n` repeat) was ~0.4 s inclusive of a 6 s idle window and appears to feed store writes that drive React re-renders (~0.5 s of `performWorkOnRoot`) — a cost that scales with robot count and runs whether or not any tile is open; and a native `createPeriodicWave` call (not referenced from `src/`, so Tone-internal) showed ~0.26 s self time at idle.

### Restructure

- Localize first, fix second: use 17.2.1's harness with Chrome's paint-flashing/layer-borders view or a trace narrowed to individual elements to find which element(s) invalidate every frame, then decide the fix per cause (cap repaint area, replace a filter with a precomputed asset, `contain`/`will-change` where it actually helps, reduce layer count). Any fix that touches robot animation goes through the "GSAP for animation, no `requestAnimationFrame` loops" rule in `CLAUDE.md` as usual.
- Confirm on a real phone before declaring it fixed — headless Chrome's software rasterization is not a phone GPU.

### About

Sequenced last because its cause is unknown and its numbers are the least trustworthy in headless Chrome; 17.2.1's harness is what turns it into something measurable. Likely overlaps with [18](#18-cabinetry-verification-accessibility--performance)'s own performance check — this series' findings should land first so that pass verifies a UI that's already been through them.

## 17.2.6 Performance: Audio Load Budget

**Implemented — see [docs/specs/AUDIO_LOAD_BUDGET.md](../specs/AUDIO_LOAD_BUDGET.md) §8 "As Shipped" and [docs/tasks/AUDIO_LOAD_BUDGET.md](../tasks/AUDIO_LOAD_BUDGET.md). Merged via PR #485/#486.**

## 17.2.7 Performance: Robot LFO Priming

**Implemented — see [docs/specs/LFO_LOAD_FIX.md](../specs/LFO_LOAD_FIX.md) and [docs/tasks/LFO_LOAD_FIX.md](../tasks/LFO_LOAD_FIX.md). Branch `bug/LFO-load`, unmerged as of writing.**

Seeded robot LFOs showed in the UI but never reached the engine — only a user edit ever connected one. `primeRobotLfos`/`primeRosterLfos` (`src/systems/robotLfoPriming.ts`) close the gap at every point a robot's voice is (re)reserved: spawn, power-on, a structural voice rebuild (also fixing a second bug — a user-connected robot LFO going silent on a layer-type change), and session load. The `volume` and `layerN.pulseWidth` LFO targets were removed and the seed odds lowered from 50% to 25% on to keep the primed count sustainable (9 targets now, not 13). The Task 11 perf gate found Full's previously-`Infinity` robot-LFO cap saturating the audio thread once priming made the cost real (bravo peak render capacity 0.40 → 0.998 at ≈18 connected robot LFOs); `ROBOT_LFO_CAP_FULL` gives Full a finite cap (equal to Standard's, 12), re-measured passing with a wide margin (peak 0.443). See `docs/PERFORMANCE.md` "Robot-LFO priming — the Task 11 perf gate" for the full measurement.

**Not Doing:** control-rate robot LFOs (`layerN.phase` already polls at control rate and stays uncapped by design); raising the global-chain LFO odds (34%, untouched — out of scope). **Superseded by [17.2.8](#1728-performance-lfo-bank) below** — the per-target engine/priming/cap this item built was replaced outright, not extended.

## 17.2.8 Performance: LFO Bank

**Implemented — see [docs/specs/LFO_BANK.md](../specs/LFO_BANK.md) and [docs/tasks/LFO_BANK.md](../tasks/LFO_BANK.md). Branch `feature/LFO-pool`, unmerged as of writing.**

Replaces one private `Tone.LFO` per modulation target (the 17.2.7 design above) with four shared, world-level, app-lifetime LFO lanes — a target now links to a lane and stores a depth instead of owning its own oscillator. Twenty tasks in five phases: Phase 1 deletes what the bank makes pointless (the `layerN.phase` target, the robot-LFO cap, the per-target held-off machinery); Phase 2 builds the bank (`src/engine/lfoEngine.ts`, renamed from `lfoBank.ts`) beside the old engine; Phase 3 flips the data/wiring so a seeded world is primed through the bank; Phase 4 swaps every panel to the inline `LfoLink` (Lane + Depth) primitive, replacing the old shared `Lfo`/`LfoTargetGroup` display and the 4-group Drift accordions (EQ/Low-Pass/High-Pass/Robot Drift) with one LFO Bank accordion (4 lane panels, each with its own Shape/Rate/Rate Drift/Depth Drift); Phase 5 deletes the old per-target engine entirely, moves persistence to session payload v2, and runs the perf gate (Task 19 — both the hard gate and the success bar passed with a wide margin on the measured worlds). `RobotLfoTargetId` is 6 now (`layer{0,1,2}.{gain,detune}` — Phase was cut, having never had a live Signal); global on-odds are 66%, robot on-odds 30% (correcting 17.2.7's own "25%" figure for the same coin flip, now reused by the bank's seeder). See `docs/AUDIO_SYSTEM.md`'s LFO Modulation section for the full current design.

**Not Doing:** the intent doc's own out-of-scope list (`docs/intent/lfo-bank.md`) — control-rate/polled bank LFOs (rejected in favor of real audio-rate nodes, may be revisited); per-link polarity/invert or other decorrelation (lockstep is wanted); lane-based load degradation (Light/Standard/Full all run all four lanes — only the filter switch and drift-off react to the dial); fixed lane "characters" with constrained ranges (the four lanes are seeded with spread rates but are otherwise blank, fully editable oscillators); migrating old sessions/share links (v1 payloads are stripped, not converted); a modulation-matrix overview UI (the per-target `LfoLink` picker is the UI).

**Follow-up (spec §7 risk 8, inherited knowingly, not fixed here):** an Attenuation Style switch while the context is already running does not re-prime the bank or global links — `regenerateLfoBankFromSeed`/`regenerateGlobalLfoLinksFromSeed` are data-only, and nothing re-primes until the next `AudioEngine.start()` (a full power cycle). Pre-dates this phase (the old per-target engine had the identical gap); fixing it is a one-line addition — `primeLfoBank`/`linkTarget` from the same AS-switch subscription, guarded by `isAudioContextRunning()` — not done here.

## 17.3 Styling Overhaul: Robot Views

Requested by Crawford, 2026-09-16. High priority — third of the 17.1–17.5 series (see 17.1). Not yet interviewed/specced. Scope: Robot Selection (`RobotsTab`, `RobotSelectionCard` — 15.2) and Robot Options (`RobotDisplaySection`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer` — 15.3) together, since both share the same robot-detail visual language.

## 17.4 Styling Overhaul: Audio Rig View

Requested by Crawford, 2026-09-16. High priority — fourth of the 17.1–17.5 series (see 17.1). Not yet interviewed/specced. Scope: `AudioRigDrawer` and its seven effect-block accordions plus the Drift accordion (10.2/10.3).

## 17.5 Styling Overhaul: Sector Settings View

Requested by Crawford, 2026-09-16. High priority — last of the 17.1–17.5 series (see 17.1). Not yet interviewed/specced. Scope: `SectorSettingsDrawer` (Attenuation Style/Planet Calibration and Plot Tuning panels) — also the direct predecessor to the new shareable-link import/export item (21, below); that item's own UI work should land after this pass, not before.

## 18. Cabinetry Verification: Accessibility & Performance

Originally inserted as `11.2` immediately after the Oblique Cabinetry series (11.1.1–11.1.9) — the same "insert out of sequence, don't renumber later phases" pattern as 10.1–10.4. Moved here and renumbered (2026-09-11, Crawford's call): 12 (Font Sizes), 14 (Color Scheme), and 15.2/15.3/16 (the three screen redesigns — 15.1 is a primitive change, not a screen, but its new `readOnly` slider state falls under this same verification pass) above all touch fonts, colors, and layout in ways this verification pass needs to check too, not just the original 11.1.x Cabinetry series — running it before those land would mean redoing it once they ship anyway. The 17.1–17.5 Styling Overhaul series (inserted 2026-09-16, directly above) extends the same reasoning further — a broader per-view visual pass touching every screen this verification checks — so it belongs before this item too, not after. Session Storage (20) comes after this instead, so persistence work starts against a UI that's already been through its accessibility/performance pass, not one about to change under it.

### About

Cabinetry's design (each 11.1.x item's own Restructure section) keeps each primitive's real Radix element in charge of all interaction and hands accessibility semantics off to Radix "for free," rather than rebuilding hit-testing/focus/ARIA from scratch — but that's an architectural intent, not a verified outcome, and this is a change touching every interactive primitive in the app at once. This phase is the check: a real keyboard-only walkthrough of every drawer (Robot Options, Audio Rig, Sector Settings, Company Manager), confirming the focus ring stays visible against a fully popped-out cabinet box (not obscured by the front face's z-index), confirming tab order wasn't disturbed by the SVG overlay's own DOM position, confirming `prefers-reduced-motion` actually cancels every cabinet timeline (pop, wall-polygon morph, and the voxel dual-fill transition alike) rather than just the ones the primitive spec called out first-hand, and a screen-reader pass over the slider voxel tracks specifically (the visual dual-fill/extrusion state carries real information — current value, how close to min/max — that must still be available to `aria-valuenow`/`aria-valuetext` via the underlying Radix `Slider`, not just implied visually). Extended by 11.1.6–11.1.9's own additions to the same check: `RadioButton`'s multi-box row (focus/selection state legible across every segment, not just the first), `AccordionContainer`'s trigger-only box (confirming the trigger's own focus ring and the coexisting content-height timeline both still behave correctly alongside the new pop timeline) — `Select`'s own equivalent check no longer applies, since 11.1.8 was cut (10.5) before it was ever built — and whatever pop-trigger `TextInput`/`CoordsInput` lands on (confirming it doesn't fight native text selection or caret visibility, the same class of bug already found once for `Toggle`, `docs/specs/OBLIQUE_CABINETRY_TOGGLE.md`).

Bundled with the same pass rather than split into a separate item: a performance check across the primitive-heaviest screens (Audio Rig's seven effect blocks plus the Drift accordion, Robot Options' Signature Array with its per-layer LFO groups) now that every rendered slider/button/toggle carries its own GSAP timeline on top of whatever LFO-target-group/AccordionContainer timelines already existed — confirming that stacking hasn't reintroduced the kind of load 10.2's own spec flagged as a real constraint at "70-100+ primaries in a typical session," now compounded by a visual layer on every one of them. Update (2026-09-18): a profiling pass after the first GitHub Pages deploy confirmed exactly that concern for real — view switches stalling the main thread long enough to pause audio — and its findings are tracked separately as [17.2.1–17.2.5](#1721-performance-view-switch-profiling-harness--baseline), ahead of this item; this pass re-verifies against their baseline rather than rediscovering the same problems.

Extended scope from the move (2026-09-11): also confirms Phase 12's new type scale didn't reintroduce label/overflow issues anywhere else the way 13 found, and that Phase 14's new color scheme still clears every contrast check this phase establishes — the redesigns in 15.2, 15.3, and 16 reuse Cabinetry primitives (including 15.1's new read-only slider state), so a real pass here covers their accessibility too rather than needing a fourth verification round.

### Docs

- docs/CONSOLE_THEMING.md gets a short "Verified" appendix once this phase completes, rather than a separate doc — recording what was checked and any fixes made, so the Cabinetry rules and their verification live in one place. By this point it should also reflect Phase 14's color scheme, superseding the static "Ballast" palette section as needed.

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

Requested by Crawford, 2026-09-28, out of an `/idea-refine` session prompted by asking whether robot battery/docking/job state should be persisted in Session Storage (20). Sequenced here, ahead of [21](#21-sector-settings-shareable-link-importexport) and [32](#32-robot-melody-history--configuration-scrubber), because both depend on it: 21 wants a share link to reproduce an exact audible *moment* (not just tuning), and 32's scrubber needs a principled way to recompute world state at an arbitrary point, not just melody.

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

**Done — full suite green, merged via PR #489. Checkpoint 4 confirmed complete.**

## 23. Nav Panel — Scrollable Views + New Section Depth

**Done — merged via PR #489 (same branch as 22). Checkpoint 6 confirmed complete.**

## 24. Nav Panel: Underline Link & Deepest-Level Auto-Expand — Superseded

**Superseded 4 days later by [Phase 25](#25-nav-panel-replace-underline-with-a-colored-cabinet-box) — `UnderlineLink.tsx` no longer exists; the auto-expand behavior it introduced remains live.**

## 25. Nav Panel: Replace Underline with a Colored Cabinet Box

**Done — merged via PR #491.**

## 26. Fleet Params Content Rework

**Done — merged via PR #492.**

## 27. Nav ↔ Accordion Sync

**Done — merged via PR #495.**

## 28. Robot Section/Subsection Config Consolidation

**Done — merged via PR #496.**

## 29. Nav Panel: Home Button, Welcome Text, Breadcrumb

**Done — merged via PR #497.**

## 30. Layout Updates Pass: Settings / Probes / Companies Content Restructuring

Added to this doc 2026-09-27 (same gap-fill audit). Source: [docs/reference/layout-updates.md](../reference/layout-updates.md), a plain-language checklist Crawford wrote 2026-09-25 — not run through `/interview-me` or a spec pass, so treat this phase's own "About" section as a summary of that checklist plus what a direct code audit (2026-09-27) confirmed actually shipped, not a spec. Landed across PR #493 (`layout/more-content`, `a4b9f10`) and part of PR #496. **~75% done** — see Open Items below before assuming this is finished.

### About

Restyles and restructures the Settings, Probes (All Probes / Individual Probe), and Companies (Companies / Individual Company) nav content areas: trait-color audits and fixes throughout (`SettingsContent.tsx`, `SectorSettingsDrawer.tsx`, `RobotSelectionCard.tsx`), section- and group-level `IntroPanel`s added everywhere following the Fleet Params pattern (26, above), and the Probes/Companies accordion groups renamed and reshaped into 4 uniform groups — Levels (was "Output"/"Dynamics"), Composition (merging "Rhythm" and "Pitches" under one new parent), Envelope (was "Contour"), and Source (a new parent wrapping the 3 oscillator accordions plus Probe Drift) — applied consistently across `RobotOptionsTab.tsx` (per-robot) and `CompanyOptionsSection.tsx` (company bulk-edit), both of which now render this shape through 28's shared `RobotSectionAccordionStack`. Also fixed: invisible button text on robot-identity-colored controls (a WCAG-luminance contrast bug in `getRobotColorStyle`), and a new "Current Settings" readout built from scratch in `AudioLoadPanel.tsx` describing the current Robot Load/Effects Load preset in words.

### Open Items (confirmed NOT done by direct code audit, 2026-09-27)

- **Group-level intro panels for the 4 Levels/Composition/Envelope/Source accordions are entirely missing** — the biggest gap. `RobotSectionAccordionStack.tsx` renders `AccordionContainer`s only, no `IntroPanel` anywhere in it or in `ROBOT_SECTIONS_CONFIG` (28's own table). The section-level intro panels for "All Probes"/Individual Probes/Companies themselves did ship — only the per-*group* intro inside each of the 4 accordions is missing.
- **The Click Track toggle was never actually removed**, despite the checklist calling for it. `CLICK_TRACK_SCHEMA` (`robotOptionsConfig.ts`), the old `PingControlsRhythmSection`/`PingControlsDrawer` components carrying it, and the underlying `src/engine/clickTrack.ts` module all still exist — dead in production (only referenced from their own test file) but not deleted, and `clickTrackActive` is still a live field threaded through `PingControlsValue`/`robotOptionsActions.ts`/`CompanyOptionsSection.tsx`.
- **The Levels accordion's row layout doesn't match the checklist's literal "Row 1: Monitor Mode alone / Row 2: Volume+LFO together" spec** — the shipped layout is a column (Mode, Volume) beside the LFO display instead. A functionally similar outcome, structurally different from what was asked for; worth a decision on whether the shipped layout is good enough as-is.
- **`RobotDisplaySection` (the Top Card) visual restyle is still outstanding** — flagged as outstanding in the checklist itself, not newly discovered; nothing since indicates it shipped. Distinct from the earlier, closed [15.3](#153-redesign-robot-detail-top-card) redesign (that one predates this checklist and doesn't cover the same restyle).

### Docs

- None yet — real lore/human copy for the placeholder `IntroPanel`s (26/30 both) and any doc updates for the accordion renames are future work.

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
- **Melody history / a way to navigate a robot's past melodies** — split out to [Phase 32](#32-robot-melody-history--configuration-scrubber), which depends on this phase shipping first.

**Done** — see [docs/intent/deterministic-robot-melody-generation.md](../intent/deterministic-robot-melody-generation.md), [docs/specs/DETERMINISTIC_ROBOT_MELODY_GENERATION.md](../specs/DETERMINISTIC_ROBOT_MELODY_GENERATION.md), and [docs/tasks/DETERMINISTIC_ROBOT_MELODY_GENERATION.md](../tasks/DETERMINISTIC_ROBOT_MELODY_GENERATION.md). Implemented on `feature/deterministic-robot-melody`, one commit per task (9 tasks), full `interview-me` → `spec-driven-development` → `planning-and-task-breakdown` → TDD pipeline before any code changed. **Shipped scope is broader than this section's own "About" framing**, resolved during the spec pass before Task 1 started: this phase doesn't just seed `regenerateMelody.ts` — it unifies spawn-time and edit-time melody generation under one shared formula (`melodyGenerator.ts`'s new `buildSeededComposition`), retiring `spawnSystem.ts`'s separate `'melody.rand'`/`melodyCallIndex` mechanic. Without that unification, a robot's very first post-spawn edit — even reverted to its original value — would have permanently shifted it off its spawn-time melody; that "no first-edit ratchet" guarantee is the phase's actual capstone acceptance criterion, proven by a dedicated test in `spawnSystem.test.ts`. Also, `compositionSeed` feeds `generateMelodyForRobot` via its existing `opts.rand` (not `opts.seed` as this section's "About" describes) — `opts.seed` only accepts one stringified number, which can't cleanly fold in five additional attribute values; confirmed with Crawford before implementation, conditioned on the substitution introducing zero incidental randomness (verified with a `Math.random` spy in tests). One real, unplanned bug was found and fixed via the TDD cycle itself: `sessionDiff.ts`'s `applySessionPayload` patched a restored robot's attribute fields but never called `regenerateMelody`, so a robot's melody stayed the fresh seed-baseline one instead of matching its overridden attributes after a session load — `SessionPayload`'s shape needed no change (as this section predicted), but the apply logic did. Full suite at completion: 195 files / 4042 tests, `build:types`/`lint`/`build` all clean. **Manual browser verification not yet performed** — no live browser available during implementation, flagged rather than skipped.

## 32. Robot Melody History / Configuration Scrubber

Requested by Crawford, 2026-09-28, out of the same `/idea-refine` session as [31](#31-deterministic-robot-melody-generation) (Deterministic Robot Melody Generation), which this phase depends on shipping first. Deliberately split out of that work rather than bundled with it — too much to land in one pass. Also depends on [20.5](#205-world-clock-deterministic-lifecycle-replay) (World Clock) if the scrubber is to recompute full world state (battery/docking/job, not just melody) at an arbitrary point — melody alone is already scrubbable once 31 ships. Not yet interviewed/specced; the UI shape is genuinely open.

### About

Once melody is a pure function of a robot's current attribute tuple, every edit a user makes during a session implicitly produces a new point in a short history of past tuples (and therefore past melodies) for that robot. This phase is about letting a user navigate back to one — "what did this robot sound like two edits ago" — without needing to remember or manually re-dial the old values.

The `/idea-refine` session flagged the obvious framing (an audio scrubber) as likely wrong: these melodies loop indefinitely, so there's no fixed track length to scrub across, and a slider-styled scrub bar would misleadingly imply navigating elapsed playback time of one continuous performance rather than jumping between distinct generated melodies. The working recommendation is a small bounded history (recent distinct tuples, deduped so a slider drag doesn't spam entries) navigated by discrete stepping (prev/next, or a compact list) rather than a continuous timeline — closer to browser back/forward than a scrubber — but this wasn't settled, and Crawford was explicitly unsure what UI shape fits. Needs its own `/interview-me` or `/idea-refine` pass before a spec: open questions include whether history is per-robot or per-session, whether it survives a reload (Session Storage does not persist it today), how large a bound feels right, and whether "jump to a past tuple" should be a full commit (overwrites the current dialed-in values) or a preview-then-commit interaction.

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
to try and see what works." Four sub-phases below, in build order (50.1 → 50.4); the rest of the menu
is backlog items 21–24 ([backlog.md](backlog.md#21-audio-palette-trials-robot-dynamics-gate-length-humanize-and-rests)).
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
  absent = the seeded value, like every field since v1. **A seeded default changes every existing
  world; a default of *off* does not** — each sub-phase says which it chooses, and "off" is the safe
  first cut for a trial.
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

## 50.1 Robot Articulation: Portamento, Envelope Curves, Bus Filter

Zero new nodes: three per-robot attributes that are parameters on nodes every robot already has, so
the budget cost is nil and the phone gate is a formality.

- **Portamento.** `Tone.Synth` is a `Monophonic`; its `portamento` (seconds) is never set, so every
  note steps. One slider per robot (0 = today) glides each layer's frequency into the next note.
  Envelope section, beside ADSR. Default: off for every existing robot, or a low seeded chance of a
  glider — the interview decides; off leaves every world sounding as it does today.
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
tasks T1–T14b committed, guard test `src/docs/robotArticulationDocs.test.ts`). Crawford's Pixel run reported no distortion
at 3:00 ([scratchy-audio-phones.md](scratchy-audio-phones.md#robot-articulation-roadmap-501-on-the-pixel--crawfords-report-2026-10-13));
the HUD underrun counts, which mode it was and the manual listen list were not reported, so they are not claimed here.
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
already rewires on the Decay toggle, so the send bus belongs there. Seeded default: every robot at the
depth the insert gives today, so no world changes until a user moves one. Swells currently ride
`reverb.wet` / `delay.wet` (audioSwells.ts's off-equivalent check); they keep riding the global return,
never a send. Phone gate: twelve `Gain`s is the cheapest node there is, but this is a topology change,
so it is measured.

## 50.3 Global Colour: Saturation and BitCrusher

Two single-instance nodes on the global chain, each with a lore name — a degraded transmission is
on-brand. `Tone.Distortion` (soft overdrive: `distortion` 0–1, `oversample`) or `Tone.Chebyshev`
(harmonic waveshaper: integer `order`) — one of the two, chosen in the interview, since they fill the
same slot — plus `Tone.BitCrusher` (`bits`). Both have `wet`, so the seeded default can be fully dry
(no world changes) or a gentle seeded band (every world gains grit — the Phase 42 kind of call).
Position: after the filters and before the Decay stage, a new slot in both of `wireGlobalFxChain`'s
orderings. Fleet Params gets a new section tab ("Colour") or two rows in Output — spec decides against
the rework's tab row. Both are LFO-able (`distortion`, `wet`) if a Bank target is wanted later, not in
this sub-phase. Phone gate: waveshapers are cheap, `oversample: '4x'` is not — the gate sets the
allowed values and the Effects Limit drops oversampling first.

## 50.4 Global Modulation Pedal: AutoWah or Phaser

One single-instance node, chosen in the interview. `Tone.AutoWah` is an envelope follower driving a
bandpass (`baseFrequency`, `octaves`, `sensitivity`, `Q`, `gain`, `follower`): it reacts to the fleet's
own dynamics and has no clock, so it is replayable in the only sense that matters. `Tone.Phaser`
(`frequency`, `octaves`, `baseFrequency`, `stages`, `Q`) carries its own LFO, so its phase is
wall-clock — the LFO Bank's accepted class — and its `frequency` could take the Free | Sync treatment
([33](#33-free--sync-toggle)). Either lands as one more slot in `wireGlobalFxChain` with `wet`, seeded
default dry or a low seeded band, the same call as 50.3. Whichever is not chosen moves to backlog 22.
Phone gate: a follower is a few nodes; Phaser's `stages` multiplies allpass filters, so the gate caps it.

## 51. Guide: A Read-Only Branch That Teaches the Whole App

Raised by Crawford, 2026-10-12: "I need a way to educate users on the overall usage of the app, not
just what an LFO is etc." Not yet interviewed or specced — run `/interview-me` → spec → plan before
building. Picked over the alternatives discussed the same day (see Not Doing). Build after
[45](#45-layout-rework-shell-nav-section-tabs-roster-off-screen) is merged, since it is laid out with
that phase's shell, nav panel and `SectionTabs`.

### About

**The gap (verified 2026-10-12).** Every explanation in the app today sits at or below the screen
level: a `?` help popover on every value control (`ContentEntry.help`, `HelpPopover`), and one
collapsed More / Less `IntroPanel` per screen and per section (`fleet.root`, `fleet.pacing`,
`probe.root`, `probe.all`, `settings.*`, `company.*` in `src/content/copy/`). The only copy that said
what the app *is* — the Deck's welcome intro, `home.root` — was deleted with the Welcome accordion in
the layout rework's follow-up on `various-small-fixes` (uncommitted as of 2026-10-12; the text is
still at `HEAD:src/content/copy/home.ts` under `home.root`); `home.ts` then carries only the off
screen's label, power hint and Transmission row. The Deck shows the world and the meta box's
world line, nothing else. So a new user powers on, hears music, watches the robots swim, and nothing
tells them the probes are the voices, that batteries drive the silences, that Fleet Params is global
and Probes per-voice, that Companies are broadcast groups, or that Sessions and the share link are how
a world is kept. The per-control and per-section copy is reachable only once they already know to open
the nav and pick a branch.

**What ships.** A fifth top-level entry in the nav panel beside Fleet Params, Probes, Companies and
Settings — working name Guide; the lore name comes out of the interview — opening a read-only screen
built from `SectionTabs`, one tab per concept, the same shell as every other branch so it reads
identically on the desk and in the phone sheet. Candidate tabs, to be settled in the interview:

- **What you're hearing** — probes are voices; each plays its own seeded melody; battery drains,
  the probe docks and goes quiet, sometimes changes its tune, then returns. The day clock. Why the
  music never repeats exactly yet is replayable.
- **Where things are** — one paragraph per branch: Fleet Params (everything at once), Probes (one
  voice, or All Probes to shift them together), Companies (groups that broadcast edits), Settings
  (sessions, sharing, audio load). What the Deck and the meta box show.
- **A first path through** — a short numbered sequence against the live app: pick a probe on the
  roster, open a section, move a slider, hear it change, save, share.
- **Sound words** — the synth vocabulary the help popovers assume, in the copy-tone guide's human
  voice, in one place: oscillator, envelope, filter, LFO, swell, sync.

Copy is content-layer entries under a new `guide.*` area (`src/content/copy/guide.ts`, the existing
`intro` shape with limited HTML, DOMPurify-sanitised as `IntroPanel` already does), written to
[docs/reference/copy-tone-guide.md](../reference/copy-tone-guide.md): lore headlines, human bodies.
The deleted `home.root` copy is the seed for the first tab, not the finished text. No new primitives:
`SectionTabs` + `IntroPanel` (non-collapsible) per tab. Nothing interactive on the screen, so no state,
no store fields beyond the nav id the panel already keeps for a branch, and nothing in the
JSON-serialisable session.

### Not Doing (and why)

- **A first-run spotlight walk over the live UI** — needs a persisted "seen" flag, a step engine, real
  component coordinates, desk and phone variants, and it fights the shell's own rules (nothing pops
  that is not interactive; the off screen stays quiet). Revisit only if people demonstrably do not read
  the Guide.
- **The manual on the off screen** — read once, before anything has been heard, in the one place
  deliberately kept quiet. The off screen keeps its one-line power hint.
- **Restoring the Deck welcome intro alone** — considered as the cheap first step; it covers the
  mental model only if the user presses More, and the Deck is the world view. Whether the Guide's first
  tab's headline also surfaces on the Deck is an interview question, not a decision here.
- **External docs or a help site** — the app is the tablet; the Guide is in it, in its voice.

### Open

- Lore name and position in the nav (last, or first for a new user?).
- Which tabs, and whether "A first path through" reads as prose or as a numbered checklist.
- Whether the Guide tab the user last read is remembered (a `uiStore` field, serialisable) or always
  opens on the first tab.
- Whether any Guide passage is linked from the help popovers or section intros (a "more in the
  Guide" line), which would need a cross-branch nav action in `navActions.ts`.

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
