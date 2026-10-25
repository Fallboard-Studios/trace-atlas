# Roadmap

Completed and cut phases have been moved to [docs/todo/archive/roadmap-archive.md](archive/roadmap-archive.md) to keep this file focused on what's still open. Phase numbers are never reused or renumbered when a phase moves — every cross-reference from specs/tasks/intent docs and from this file's own internal links stays valid whichever file a phase currently lives in.

The order the open phases and backlog items get done in is [plan.md](plan.md); this file is the record, that one is the sequence.

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

**Done — see [docs/specs/ROBOT_MELODY_SEED_ENGINE.md](../specs/archive/ROBOT_MELODY_SEED_ENGINE.md).**

## 7. Robot Systems Engine

**Done — see [docs/specs/ROBOT_SYSTEMS_ENGINE.md](../specs/archive/ROBOT_SYSTEMS_ENGINE.md).**

## 8. Robot Selection

**Done — see [docs/specs/ROBOT_SELECTION.md](../specs/archive/ROBOT_SELECTION.md).**

## 9. Robot Options

**Done — see [docs/specs/ROBOT_OPTIONS.md](../specs/archive/ROBOT_OPTIONS.md) and [docs/tasks/ROBOT_OPTIONS.md](../tasks/archive/ROBOT_OPTIONS.md), plus post-launch fixes.**

## 10. Companies

**Done — see [docs/specs/COMPANIES.md](../specs/archive/COMPANIES.md) and [docs/tasks/COMPANIES.md](../tasks/archive/COMPANIES.md).**

## 10.1 Attenuation Style (single-planet reskin)

**Done — see [docs/specs/ATTENUATION_STYLE.md](../specs/archive/ATTENUATION_STYLE.md) and [docs/tasks/ATTENUATION_STYLE.md](../tasks/archive/ATTENUATION_STYLE.md).**

## 10.2 LFO Modulation Engine (Stacked LFO Drift)

**Done — see [docs/specs/LFO_DRIFT.md](../specs/archive/LFO_DRIFT.md) and [docs/tasks/LFO_DRIFT.md](../tasks/archive/LFO_DRIFT.md); superseded in shape (not scope) by 10.3's 4-group reshape.**

## 10.3 LFO Modulation Engine — Multi-Group Drift

**Done — see [docs/specs/LFO_DRIFT_GROUPS.md](../specs/archive/LFO_DRIFT_GROUPS.md) and [docs/tasks/LFO_DRIFT_GROUPS.md](../tasks/archive/LFO_DRIFT_GROUPS.md).**

## 10.4 Attenuation Style Internal Rename

**Done — see [docs/specs/ATTENUATION_STYLE_RENAME.md](../specs/archive/ATTENUATION_STYLE_RENAME.md) and [docs/tasks/ATTENUATION_STYLE_RENAME.md](../tasks/archive/ATTENUATION_STYLE_RENAME.md).**

## 10.5 Company Assignment: Select → RadioButton

**Done — see [docs/specs/COMPANY_ASSIGNMENT_RADIO.md](../specs/archive/COMPANY_ASSIGNMENT_RADIO.md) and [docs/tasks/COMPANY_ASSIGNMENT_RADIO.md](../tasks/archive/COMPANY_ASSIGNMENT_RADIO.md).**

## 11. Console Theming — Cut

**Cut at Crawford's call after being fully implemented and evaluated — see [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md) for the full retrospective.**

## 11.1.1 Oblique Cabinetry: Foundation & Button

**Done — see [docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md](../specs/archive/OBLIQUE_CABINETRY_FOUNDATION.md) and [docs/tasks/OBLIQUE_CABINETRY_FOUNDATION.md](../tasks/archive/OBLIQUE_CABINETRY_FOUNDATION.md).**

## 11.1.2 Oblique Cabinetry: Toggle

**Done — see [docs/specs/OBLIQUE_CABINETRY_TOGGLE.md](../specs/archive/OBLIQUE_CABINETRY_TOGGLE.md) and [docs/tasks/OBLIQUE_CABINETRY_TOGGLE.md](../tasks/archive/OBLIQUE_CABINETRY_TOGGLE.md).**

## 11.1.3 Oblique Cabinetry: SliderLinear (Voxel-Track Foundation)

**Done — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md](../specs/archive/OBLIQUE_CABINETRY_SLIDER_LINEAR.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_LINEAR.md](../tasks/archive/OBLIQUE_CABINETRY_SLIDER_LINEAR.md).**

## 11.1.4 Oblique Cabinetry: SliderLog

**Done — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md](../specs/archive/OBLIQUE_CABINETRY_SLIDER_LOG.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_LOG.md](../tasks/archive/OBLIQUE_CABINETRY_SLIDER_LOG.md).**

## 11.1.5 Oblique Cabinetry: SliderCenteredZero

**Done — see [docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md](../specs/archive/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md) and [docs/tasks/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md](../tasks/archive/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md).**

## 11.1.5.1 Oblique Cabinetry: SliderLinear vertical box verification

**Done — one real bug found and fixed (`CabinetBox`'s left-face wall height); see [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md)'s "Voxel-track sliders" section.**

## 11.1.5.2 Oblique Cabinetry: SliderLog vertical box verification

**Done — same shared fix as 11.1.5.1, verified against `SliderLog`'s real vertical consumers; no `SliderLog`-specific issues found.**

## 11.1.5.3 Oblique Cabinetry: SliderCenteredZero vertical box verification

**Done — same shared fix as 11.1.5.1, verified against `SliderCenteredZero`'s real vertical consumers; no correction needed.**

## 11.1.6 Oblique Cabinetry: RadioButton

**Done — see [docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md](../specs/archive/OBLIQUE_CABINETRY_RADIO_BUTTON.md), [docs/tasks/OBLIQUE_CABINETRY_RADIO_BUTTON.md](../tasks/archive/OBLIQUE_CABINETRY_RADIO_BUTTON.md), and [docs/intent/oblique-cabinetry-radio-button.md](../intent/archive/oblique-cabinetry-radio-button.md).**

## 11.1.7 Oblique Cabinetry: AccordionContainer

**Done — see [docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md](../specs/archive/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md), [docs/tasks/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md](../tasks/archive/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md), and [docs/intent/oblique-cabinetry-accordion-container.md](../intent/archive/oblique-cabinetry-accordion-container.md).**

## 11.1.8 Oblique Cabinetry: Select — Cut

**Cut before any implementation began — `Select` itself was removed by [10.5](#105-company-assignment-select--radiobutton), leaving no trigger to wire into Cabinetry.**

## 11.1.9 Oblique Cabinetry: TextInput / CoordsInput

**Done — see [docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md](../specs/archive/OBLIQUE_CABINETRY_TEXT_INPUT.md), [docs/tasks/OBLIQUE_CABINETRY_TEXT_INPUT.md](../tasks/archive/OBLIQUE_CABINETRY_TEXT_INPUT.md), and [docs/intent/oblique-cabinetry-text-input.md](../intent/archive/oblique-cabinetry-text-input.md). Closing stamp added 2026-09-27; confirmed shipped on `main` via `599ea19`.**

## 12. Font Sizes: App-Wide Type Scale

**Done — see [docs/intent/type-scale.md](../intent/archive/type-scale.md), [docs/specs/TYPE_SCALE.md](../specs/archive/TYPE_SCALE.md), and [docs/tasks/TYPE_SCALE.md](../tasks/archive/TYPE_SCALE.md). Merged via PR #457.**

## 13. Bug: Vertical Slider Label Overflow

**Done — confirmed shipped on `main`; fixed by switching vertical slider `overflow-y` from `auto` to `hidden`.**

## 14. Visual Identity: Color Scheme & Trait-Based Theming

**Done — see [docs/intent/color-scheme-trait-theming.md](../intent/archive/color-scheme-trait-theming.md), [docs/specs/COLOR_SCHEME_TRAIT_THEMING.md](../specs/archive/COLOR_SCHEME_TRAIT_THEMING.md), and [docs/tasks/COLOR_SCHEME_TRAIT_THEMING.md](../tasks/archive/COLOR_SCHEME_TRAIT_THEMING.md).**

## 15.1 Component: SliderLinear Read-Only Mode

**Done — see [docs/specs/SLIDER_LINEAR_READ_ONLY.md](../specs/archive/SLIDER_LINEAR_READ_ONLY.md).**

## 15.2 Redesign: Robot Cards

**Done — see [docs/specs/ROBOT_CARDS_REDESIGN.md](../specs/archive/ROBOT_CARDS_REDESIGN.md) and [docs/intent/robot-cards-redesign.md](../intent/archive/robot-cards-redesign.md).**

## 16. Redesign: Company CRUD Area

**Done — narrower scope than originally drafted (Company Section Enhancements + Company CRUD Button Preview + 10.5's Select→RadioButton swap); see [docs/specs/COMPANY_SECTION_ENHANCEMENTS.md](../specs/archive/COMPANY_SECTION_ENHANCEMENTS.md) and [docs/specs/COMPANY_CRUD_BUTTON_PREVIEW.md](../specs/archive/COMPANY_CRUD_BUTTON_PREVIEW.md).**

## 15.3 Redesign: Robot Detail Top Card

**Done — see [docs/intent/robot-detail-top-card-redesign.md](../intent/archive/robot-detail-top-card-redesign.md), [docs/specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md](../specs/archive/ROBOT_DETAIL_TOP_CARD_REDESIGN.md), and [docs/tasks/ROBOT_DETAIL_TOP_CARD_REDESIGN.md](../tasks/archive/ROBOT_DETAIL_TOP_CARD_REDESIGN.md).**

## 17.1 Styling Overhaul: Sleeve / Tablet-Off State

**Done — styled directly by Crawford, confirmed 2026-09-27; no separate spec pass. See [docs/todo/archive/roadmap-archive.md#171-styling-overhaul-sleeve--tablet-off-state](archive/roadmap-archive.md#171-styling-overhaul-sleeve--tablet-off-state).**

## 17.2 Styling Overhaul: Console Hub (No View Selected)

**Done — superseded rather than built as originally scoped, confirmed by Crawford 2026-09-27. See [docs/todo/archive/roadmap-archive.md#172-styling-overhaul-console-hub-no-view-selected](archive/roadmap-archive.md#172-styling-overhaul-console-hub-no-view-selected).**

## 17.2.1 Performance: View-Switch Profiling Harness & Baseline

**Done — see [docs/PERFORMANCE.md](../PERFORMANCE.md). Implemented on `bug/view-change-slowdown`, merged via PR #484.**

## 17.2.2 Performance: Lazy-Mount Collapsed Accordion Content

**Done — see [docs/specs/ACCORDION_LAZY_MOUNT.md](../specs/archive/ACCORDION_LAZY_MOUNT.md) and [docs/tasks/ACCORDION_LAZY_MOUNT.md](../tasks/archive/ACCORDION_LAZY_MOUNT.md). Merged via PR #484.**

## 17.2.3 Performance: CabinetBox Mount-Time Layout Thrash

**Never built — mooted by [Phase 22](#22-navigation--layout-rewrite)'s Navigation & Layout Rewrite, whose one-node-mounted-at-a-time content model sidesteps this class of problem by construction.**

## 17.2.4 Performance: Audio Scheduling Headroom (Tone lookAhead)

**Closed without building, 2026-09-27 — confirmed by Crawford.** No longer needed: the Audio Load Budget's (17.2.6) `latencyHint` preset switch already covers the "reduce audible dropouts on a slow device" goal this item was scoped for. Raising `lookAhead` itself was never implemented. See [docs/todo/archive/roadmap-archive.md#1724-performance-audio-scheduling-headroom-tone-lookahead](archive/roadmap-archive.md#1724-performance-audio-scheduling-headroom-tone-lookahead).

## 17.2.5 Performance: Idle Paint & Composite Cost

**Done — merged via PR #524 (`perf/idle-paint`); the real-phone confirmation was never recorded here, and [53](#53-per-mover-compositor-layers) replaced the moving-layer split it built. Moved to [the archive](archive/roadmap-archive.md#1725-performance-idle-paint--composite-cost).**

## 17.2.6 Performance: Audio Load Budget

**Implemented — see [docs/specs/AUDIO_LOAD_BUDGET.md](../specs/archive/AUDIO_LOAD_BUDGET.md) §8 "As Shipped" and [docs/tasks/AUDIO_LOAD_BUDGET.md](../tasks/archive/AUDIO_LOAD_BUDGET.md). Merged via PR #485/#486.**

## 17.2.7 Performance: Robot LFO Priming

**Done — merged via PR #520 (`bug/LFO-load`); superseded by [17.2.8](#1728-performance-lfo-bank). Moved to [the archive](archive/roadmap-archive.md#1727-performance-robot-lfo-priming).**

## 17.2.8 Performance: LFO Bank

**Done — merged via PR #521 (`feature/LFO-pool`); its last open item (an Attenuation Style switch re-primes a running bank) merged via PR #579 (`perf/as-switch-reprimes-lfo-bank`). Moved to [the archive](archive/roadmap-archive.md#1728-performance-lfo-bank).**

## 17.3 Styling Overhaul: Robot Views

**Cut, 2026-10-22 (Crawford) — never interviewed; the Layout Rework ([45](#45-layout-rework-shell-nav-section-tabs-roster-off-screen)) restyled these views instead. Moved to [the archive](archive/roadmap-archive.md#173-styling-overhaul-robot-views).**

## 17.4 Styling Overhaul: Audio Rig View

**Cut, 2026-10-22 (Crawford) — never interviewed; superseded by [45](#45-layout-rework-shell-nav-section-tabs-roster-off-screen). Moved to [the archive](archive/roadmap-archive.md#174-styling-overhaul-audio-rig-view).**

## 17.5 Styling Overhaul: Sector Settings View

**Cut, 2026-10-22 (Crawford) — never interviewed; superseded by [45](#45-layout-rework-shell-nav-section-tabs-roster-off-screen). Moved to [the archive](archive/roadmap-archive.md#175-styling-overhaul-sector-settings-view).**

## 18. Cabinetry Verification: Accessibility & Performance

**Cut, 2026-10-22 (Crawford) — never run as the single pass it describes; the UI it was written against has since been rebuilt by [45](#45-layout-rework-shell-nav-section-tabs-roster-off-screen). Moved to [the archive](archive/roadmap-archive.md#18-cabinetry-verification-accessibility--performance).**

## 19. Test Coverage: Untested Core Modules

**Done — merged via PR #501 (`tests/core-modules-coverage`). Moved to [the archive](archive/roadmap-archive.md#19-test-coverage-untested-core-modules).**

## 20. Session Storage

**Done — merged via PR #503 (`feature/session-storage`); the autosave amendment and its removal followed in #506 (`features/session-updates`). Moved to [the archive](archive/roadmap-archive.md#20-session-storage).**

## 20.5. World Clock: Deterministic Lifecycle Replay

**Done — merged via PR #507 (`feature/worldclock`). Moved to [the archive](archive/roadmap-archive.md#205-world-clock-deterministic-lifecycle-replay).**

## 21. Sector Settings: Shareable Link Import/Export

**Done — merged via PR #508 (`feature/sharing`). Moved to [the archive](archive/roadmap-archive.md#21-sector-settings-shareable-link-importexport).**

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

**Done — landed via PR #493 (`layout/more-content`) and part of #496; the four open items from the 2026-09-27 audit were closed as obsolete by Crawford on 2026-10-22. Moved to [the archive](archive/roadmap-archive.md#30-layout-updates-pass-settings--probes--companies-content-restructuring).**

## 31. Deterministic Robot Melody Generation

**Done — merged via PR #504 (`feature/deterministic-robot-melody`). Moved to [the archive](archive/roadmap-archive.md#31-deterministic-robot-melody-generation).**

## 32. Robot Melody History / Configuration Scrubber

Requested by Crawford, 2026-09-28, out of the same `/idea-refine` session as [31](#31-deterministic-robot-melody-generation) (Deterministic Robot Melody Generation), which this phase depends on shipping first. Deliberately split out of that work rather than bundled with it — too much to land in one pass. Also depends on [20.5](#205-world-clock-deterministic-lifecycle-replay) (World Clock) if the scrubber is to recompute full world state (battery/docking/job, not just melody) at an arbitrary point — melody alone is already scrubbable once 31 ships. Not yet interviewed/specced; the UI shape is genuinely open.

### About

Once melody is a pure function of a robot's current attribute tuple, every edit a user makes during a session implicitly produces a new point in a short history of past tuples (and therefore past melodies) for that robot. This phase is about letting a user navigate back to one — "what did this robot sound like two edits ago" — without needing to remember or manually re-dial the old values.

The `/idea-refine` session flagged the obvious framing (an audio scrubber) as likely wrong: these melodies loop indefinitely, so there's no fixed track length to scrub across, and a slider-styled scrub bar would misleadingly imply navigating elapsed playback time of one continuous performance rather than jumping between distinct generated melodies. The working recommendation is a small bounded history (recent distinct tuples, deduped so a slider drag doesn't spam entries) navigated by discrete stepping (prev/next, or a compact list) rather than a continuous timeline — closer to browser back/forward than a scrubber — but this wasn't settled, and Crawford was explicitly unsure what UI shape fits. Needs its own `/interview-me` or `/idea-refine` pass before a spec: open questions include whether history is per-robot or per-session, whether it survives a reload (Session Storage does not persist it today), how large a bound feels right, and whether "jump to a past tuple" should be a full commit (overwrites the current dialed-in values) or a preview-then-commit interaction.

## 33. Free | Sync Toggle

**Done — merged via PR #522 (`feature/sync-toggle`). Moved to [the archive](archive/roadmap-archive.md#33-free--sync-toggle).**

## 34. Layout Updates Pass 2: Post-Sync-Toggle Row Reshuffle

**Done — merged via PR #523 (`layout/post-sync-toggle`). Moved to [the archive](archive/roadmap-archive.md#34-layout-updates-pass-2-post-sync-toggle-row-reshuffle).**

## 35. World Palette Pull

**Done — merged via PR #525 (`feature/world-colors`). Moved to [the archive](archive/roadmap-archive.md#35-world-palette-pull).**

## 36. Robot Live Visuals

**Done — merged via PR #526 (`feature/robot-rework`); the hand-drawn shapes it animated were replaced by [39](#39-gem-polygon-robots-branch-a). Moved to [the archive](archive/roadmap-archive.md#36-robot-live-visuals).**

## 37. Robot Greebles

**Done — merged via PR #526 (`feature/robot-rework`); superseded by [39](#39-gem-polygon-robots-branch-a), which removed the greebles. Moved to [the archive](archive/roadmap-archive.md#37-robot-greebles).**

## 38. Robot Layer Markers

**Done — merged via PR #526 (`feature/robot-rework`); superseded by [39](#39-gem-polygon-robots-branch-a), which removed the layer sockets. Moved to [the archive](archive/roadmap-archive.md#38-robot-layer-markers).**

## 39. Gem Polygon Robots (Branch A)

**Done — merged via PR #527 (`feature/orbiting-polygons`, which carried `back-to-gen-robots`). Moved to [the archive](archive/roadmap-archive.md#39-gem-polygon-robots-branch-a).**

## 40. Orbiting Polygons

**Done — merged via PR #527 (`feature/orbiting-polygons`), redesigned mid-build from orbits to docking. Moved to [the archive](archive/roadmap-archive.md#40-orbiting-polygons).**

## 41. Robot Halo and Lit Lines

**Done — merged via PR #528 (`feature/mystery-light`). Moved to [the archive](archive/roadmap-archive.md#41-robot-halo-and-lit-lines).**

## 42. World View Districts

**Done — on main since PRs #534–#536 (D1 came in with `planning/jobs-locales-docking`, D2 and D3 with `feature/world-atmosphere`). Moved to [the archive](archive/roadmap-archive.md#42-world-view-districts).**

## 43. Robot Jobs and Charging Stations

**Done — merged via PRs #537–#544 (`feature/jobs-lifecycle` through `feature/jobs-depth`) and #546 (docs). Moved to [the archive](archive/roadmap-archive.md#43-robot-jobs-and-charging-stations).**

### Still open

- **Background parks below the roof** (spec §7 Q6): 10 of 1 523 background sites over the
  121-seed grid park low; drop them or park beside them is Crawford's call
  ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md#known-gaps)).

## 44. World Gem Material (Option A)

**Done — on main since PR #547 (`feature/layout-rework` carried `feature/world-gem`); the Task 20 by-eye look and Pixel listen were never recorded here. Moved to [the archive](archive/roadmap-archive.md#44-world-gem-material-option-a).**

## 45. Layout Rework (shell, nav, section tabs, roster, off screen)

**Done — merged via PR #547 (`feature/layout-rework`). Moved to [the archive](archive/roadmap-archive.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen).**

### Open

- The meta box's selection lines were deleted after the code review (2026-10-11): every selection opens a branch
  and `goHome` clears both ids, so the Deck never has a selection. The halo stays; bring the lines back from git
  history (commit before this note) if a surface ever shows them.
- Compositor::Update is about 15–20 % higher on Fleet Params than on `main` (not a gate metric, not
  investigated).
- The Move sheet's 500 ms tap-hold was not tested on a touch device.

## 46. Mobile Deck Camera (the world crop on phones)

**Done — merged via PR #548 (`feature/deck-camera`) and #562 (`fix/deck-camera-idle-range`). Moved to [the archive](archive/roadmap-archive.md#46-mobile-deck-camera-the-world-crop-on-phones).**

## 48. One Day Clock: Remove the Measure-Based Day

**Done — merged via PR #552 (`fix/unused-clock-code`). Moved to [the archive](archive/roadmap-archive.md#48-one-day-clock-remove-the-measure-based-day).**

## 49. Robot Pan: a Pan Slider Beside Volume, with Auto

**Done — merged via PR #553 (`feature/panning-update`). Moved to [the archive](archive/roadmap-archive.md#49-robot-pan-a-pan-slider-beside-volume-with-auto).**

## 50. Audio Palette: New Attributes Without New Libraries

**Done — all seven sub-phases below merged (PRs #555–#559, #565 and #569); the remaining palette trials live in the backlog. Moved to [the archive](archive/roadmap-archive.md#50-audio-palette-new-attributes-without-new-libraries).**

## 50.1 Robot Articulation: Portamento, Envelope Curves, Bus Filter

**Done — merged via PR #555 (`feature/palette-articulation`). Moved to [the archive](archive/roadmap-archive.md#501-robot-articulation-portamento-envelope-curves-bus-filter).**

## 50.2 Robot Sends: Per-Robot Reverb and Delay Depth

**Done — merged via PR #556 (`feature/palette-sends`). Moved to [the archive](archive/roadmap-archive.md#502-robot-sends-per-robot-reverb-and-delay-depth).**

## 50.3 Global Colour: Saturation and BitCrusher

**Done — merged via PR #557 (`feature/palette-colour`). Moved to [the archive](archive/roadmap-archive.md#503-global-colour-saturation-and-bitcrusher).**

## 50.4 Global Modulation Pedal: AutoWah or Phaser

**Done — merged via PR #558 (`feature/palette-modulation`). Moved to [the archive](archive/roadmap-archive.md#504-global-modulation-pedal-autowah-or-phaser).**

## 50.5 Robot Performance: Dynamics, Rests, Accents, Humanize

**Done — merged via PR #559 (`feature/palette-performance`). Moved to [the archive](archive/roadmap-archive.md#505-robot-performance-dynamics-rests-accents-humanize).**

## 50.6 Global Pedals: Chorus, Tremolo, Vibrato, Frequency Shifter and Width

**Done — merged via PR #565 (`feature/pedals`). Moved to [the archive](archive/roadmap-archive.md#506-global-pedals-chorus-tremolo-vibrato-frequency-shifter-and-width).**

## 50.7 Robot Effect Sends: Grit, Shimmer and Double

**Done — merged via PR #569 (`feature/robot-effect-sends`). Moved to [the archive](archive/roadmap-archive.md#507-robot-effect-sends-grit-shimmer-and-double).**

## 51. Guide: A Read-Only Branch That Teaches the Whole App

Raised by Crawford, 2026-10-12: "I need a way to educate users on the overall usage of the app, not
just what an LFO is etc." Not yet interviewed or specced — run `/interview-me` → spec → plan before
building. Picked over the alternatives discussed the same day (see Not Doing). Build after
[45](#45-layout-rework-shell-nav-section-tabs-roster-off-screen) is merged, since it is laid out with
that phase's shell, nav panel and `SectionTabs`.

**Crawford, 2026-10-22:** a large undertaking, to be approached as such. The likely shape is one tabbed
window that shows everything, rather than a branch of nav pages; the interview starts from that.

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

**Done — merged via PR #551 (`feature/job-decorations`). Moved to [the archive](archive/roadmap-archive.md#52-job-decorations-six-small-animations-on-the-orbiters-work).**

### Open

- Spec questions 1, 2, 3 and 5 (battery dim, identity colour, count 1, droplet numbers) shipped as the spec
  proposed them and were not separately confirmed by Crawford.
- ~~The Pixel listen (Task 15)~~ — passed 2026-10-22 via the Robot Effect Sends T21 runs (seven runs at Full and
  Standard with the decorations in both builds, fleet working, no stutter); the Full-tier cost cut it would have
  triggered is not needed. Recorded in docs/tasks/JOB_DECORATION.md and PERFORMANCE.md.

## 53. Per-Mover Compositor Layers

**Done — merged via PR #563 (`perf/per-mover-layers`). Moved to [the archive](archive/roadmap-archive.md#53-per-mover-compositor-layers).**

### Open

- **Safari**: spec §5.3's manual list has never been run in Safari. Checkpoints B and C passed in Chrome and Firefox
  (Crawford, 2026-10-24; ticked in [the plan](../tasks/PER_MOVER_COMPOSITOR_LAYERS.md)). Run it when a Mac or iPhone is
  to hand.

The archived Open list's other three items were settled after it was written: the document repaint was the harness
counting Chrome's whole-frame `#document` paint (the gate re-run passes at 0.08 × `main`); the Pixel `main` comparison
was closed by Crawford's decision on 2026-10-18; and the bubble strips were measured (review follow-up R5), their
busy-time miss accepted on 2026-10-18. See [PERFORMANCE.md](../PERFORMANCE.md) "the Task 20 gate, re-run with the
frame wrappers left out", "the Pixel A/B: not separable on the phone" and the two R5 sections.

## 54. Output Headroom: No Clipping Out of the Box

**Done — merged via PR #573 (`feature/output-headroom`), 2026-10-23. Moved to [the archive](archive/roadmap-archive.md#54-output-headroom-no-clipping-out-of-the-box).**

## 55. Robot Sends: One Table for the Five Sends

**Done — merged via PR #570 (`refactor/robot-send-table`), 2026-10-22. Moved to [the archive](archive/roadmap-archive.md#55-robot-sends-one-table-for-the-five-sends).**

## 56. Short World Link

Backlog [19](archive/backlog-archive.md#19-short-world-link-bring-back-seed-x-and-y), raised by Crawford on 2026-10-09
and widened on 2026-10-22: bring back `?seed=`, `?x=` and `?y=` for an untouched world, and make a tweaked world's link
short. One wire format replaces roadmap [21](#21-sector-settings-shareable-link-importexport)'s `?session=`:
`?seed=<exact name>&x=<int>&y=<int>`, plus one `s=1.<base64url of raw-deflated compact JSON>` param only when the world
differs from what its seed regenerates. Phase 21's boot seam, two-phase boot and Share buttons stay.

**Status: built 2026-10-25 on `feature/short-world-link`, off `main` at `fee2de9e`, PR pending** (Crawford opens it;
intent [short-world-link.md](../intent/short-world-link.md), spec [SHORT_WORLD_LINK.md](../specs/SHORT_WORLD_LINK.md),
plan [SHORT_WORLD_LINK.md](../tasks/SHORT_WORLD_LINK.md)). Tasks T0–T16 done, with T6b added during the build. Crawford
passed Checkpoint B. The review boxes for Checkpoints A and C are not ticked in the plan.

### As built

- **One new dependency, `fflate` 0.8.3**, named imports only (`deflateSync`, `inflateSync`, `strToU8`, `strFromU8`), so
  the boot decode stays synchronous. The main chunk grew 13.0 kB (5.5 kB gzip) over the branch, against an estimate of
  about 8 kB.
- **Three new modules.** `worldLink.ts` holds the params, the versioned blob, the lenient decode and the encoder.
  `seedBaseline.ts` regenerates a name's world-level fields through the eight pure generators;
  `diffWorldAgainstSeed` and `fillWorldFromSeed` are inverses. `worldDiffCodec.ts` holds the compact codec, which T6b
  moved out of `sessionShareUtils.ts` to break an import cycle. `deepEqual` moved to `math.ts`. `sessionShareUtils.ts`
  keeps only the seam, `buildShareUrl` and `copySessionLink`.
- **Size.** Crawford's own world (`n40dh8p8` at (29, −14): twelve edited robots, and all 17 Audio Rig blocks off their seed) went from
  a 14,092-character `session` param to a 1,722-character `s`, or 1,784 characters for the whole localhost URL. That is
  about 7 % over the 1,615 the intent measured; the cause is not known.
- **Buttons.** T9 added Copy link in Settings → Seeds, beside the Sessions panel's Share live and each save's Share.
  All three use one encoder.
- **Deleted.** T11 removed the `seedUtils.ts` override primitives, `parseCoordinateParam` and
  `resolveDefaultAttenuationStyleName`; T7 removed the `?session=` codec. The HUD's world line now reads the style name
  (T10). It had printed `random` for every world since Phase 21.
- **Harness and docs.** `perf:audio`'s pin check reads the spec's `x:y` (T13). T14 re-minted 18 recorded `?session=`
  links in PERFORMANCE.md and scratchy-audio-phones.md with the shipped encoder (the plan said five) and opened each one
  once in headless Chrome. T15 rewrote SESSION_STORAGE.md, PROCEDURAL_GENERATION.md and the Phase 21 spec's header.
- **Fixed after the branch's code review (2026-10-25): an untouched world copied a blob, not its bare triple.** A save
  snaps the rig to its slider steps and rounds the LFO drifts; the seed baseline compared against the raw generators,
  so every untouched world carried a 225–350-character `s=` (measured on 20 of 20 fresh worlds). The baseline now goes
  through the same capture step (`src/utils/sessionCapture.ts`). `worldLinkBoot.test.ts` drives the real boot (stores,
  `initializeLocale`, `applySessionPayload`, `buildSessionPayload`), which no earlier test did.
- **Spec §7, as taken.** Every item was built on its default, and none was vetoed: Share live stays; the blob param is
  `s`; D1–D5 are re-minted; floats are not rounded on the wire; the decoder returns a whole payload; the name is not
  capped; this number and title.
- **Accepted: generator drift (spec risk 1).** "Absent means seeded" holds only while the generators stay as they are.
  A later change to a generator turns every untouched field of an old link into a diff nobody wrote, and silently
  changes what an old link plays. Pre-v1, nothing mitigates it, by design.
- Old `?session=` links open a random world. There is no migration and no fallback (the intent's call).

### Open

- Checkpoint C: Crawford's review, and spec §5's manual list run once end to end, including the 320 px look at the
  Seeds drawer and T10's `?debug` HUD check. The agent ran neither.
- Spec §5's static grep still has two false positives: the `'session'` content-area name (`src/content/types.ts`) and
  a T13 test comment quoting the old `from: 'session'` return.
- The re-minted links resolve only on a build that has the world link. The on-hold phone sitting has to carry this
  branch, or `main` after the merge, not today's `main`.
- The PR.

