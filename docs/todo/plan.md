# Plan

The order in which the open work gets done, agreed with Crawford on 2026-10-22. This file is an opinion, re-ordered
whenever priorities move; the records it points at are [roadmap.md](roadmap.md) (phases, numbered, never renumbered)
and [backlog.md](backlog.md) (smaller items, likewise). Nothing is described twice: each line here is a stage, a number,
one sentence and a link, and the detail, decisions and open questions live behind the link. When an item ships it
moves to the archives in the usual way and its line here is deleted.

Reading the stages: each one ends at a point where Crawford listens or looks before the next begins. "Interview" means
`/interview-me` → spec → plan before any code, as CLAUDE.md's workflow skills require.

## Stage 1 — Sound right first

- Backlog [23](backlog.md#23-audio-palette-trials-dynamics-processing-and-ducking) **Dynamics processing and ducking** —
  interviewed with 54 and deferred: built only if the single Compressor sounds wrong now that it is off safety duty.

## Stage 2 — The underruns: desktop first, then one phone sitting

Measure before changing anything. The desktop answers what it can; the Pixel comes out once, at the end, for only what
the desktop could not. The two rested Pixel sittings of 2026-10-22 and 2026-10-23 re-ordered this stage (backlog 27,
"Next, re-ordered").

- Backlog [27](backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included) **Phone underruns, the
  Light-tier clicks and the late collapse** — desktop first: D1 against D5 at Light on `perf:audio`, then the 15-minute
  long run; the Incognito tab and the cool-phone sine ramp drop to the sitting, and only if the collapse is still
  unexplained.
- Backlog [29](backlog.md#29-audio-a-connect-sometimes-loses-a-render-quantum-main-included) **A connect loses a render
  quantum** — the headed-Chrome probe on a real output device, then the bare page without Tone; by ear on the Pixel in
  the sitting.
- Backlog [28](backlog.md#28-audio-eq3-and-the-two-filters-stay-in-the-chain-at-neutral) **EQ3 and the filters at
  neutral** — closes itself if nothing in 27 or 29 points at them.
- Roadmap [53](roadmap.md#53-per-mover-compositor-layers) **Checkpoints B and C, Safari** — the desktop look list, never
  signed off; same verify-don't-build mood.
- Roadmap [17.2.8](roadmap.md#1728-performance-lfo-bank) **Style switch re-primes the LFO bank** — one TDD task, the
  per-lane push the stub describes.
- **The phone sitting**, last — 29's lighting by ear, and whatever 27 still owes.

## Stage 3 — The powered-down state

- Backlog [19](backlog.md#19-short-world-link-bring-back-seed-x-and-y) **Short world link, and a shorter `?session=`**
  — first, because a preset entry is a short link and 5's interview needs to know what a preset is. A library is
  allowed; the boot seam is synchronous.
- Backlog [5](backlog.md#5-sector-settings-ascoordsfavorites-reorganization) **The off screen: themes, sessions,
  presets** — Crawford's plan for the powered-down state; the interview fixes the surface, including where item 7's
  selection UI goes.
- Backlog [1](backlog.md#1-onload-better-power-off-background) and [3](backlog.md#3-onload-sleeve-logo) **Off
  background art, sleeve logo** — blocked on artwork, but they land on this screen, so decided here.

## Stage 4 — The Guide

- Roadmap [51](roadmap.md#51-guide-a-read-only-branch-that-teaches-the-whole-app) **The Guide** — large; likely one
  tabbed window that shows everything. After Stage 3 so it describes the off screen as it will be.

## Stage 5 — The music

- Backlog [7](backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter) **Tagged progressions,
  seeded mood chain** — the engine, catalogue and chain (large); its UI was decided in Stage 3. Backlog
  [17](backlog.md#17-audit-lfo-drift--audio-swells--ping-variance--replayability-findings)'s audit notes feed its
  determinism design and archive once the spec absorbs them.
- Backlog [24](backlog.md#24-audio-palette-trials-transport-groove-and-tempo-walk) **Swing, then maybe a tempo walk** —
  swing is one store field and one transport write and may satisfy
  [6](backlog.md#6-audio-groove-feature) **Groove** outright; the walk only if a world feels metronomic.
- Backlog [20](backlog.md#20-audio-user-authored-progressions-and-tags-editor-ui--maybe) **User-authored progressions**
  — a maybe; only if 7 earns it, and then its own roadmap phase.

## Stage 6 — Observe the world

Interview these three together: they share one decision about what to record and what survives a reload, even if only
one is built.

- Backlog [18](backlog.md#18-telemetry-charts-of-notes-played-jobs-worked-fleet-activity) **Telemetry charts** — needs
  the visit log.
- Backlog [25](backlog.md#25-neighbourhood-map-coherent-districts-and-the-visited-log) **Neighbourhood map, visited log**
  — the map needs a world-level district field, a generation change.
- Roadmap [32](roadmap.md#32-robot-melody-history--configuration-scrubber) **Melody history / scrubber** — UI shape still
  open.

## Parked (not sequenced)

- Backlog [10](backlog.md#10-visuals-atmospheric-animations) **Fog, dust, precipitation** — unspecified; light shafts
  shipped, marine snow was cut.
- Backlog [13](backlog.md#13-svg-invalid-empty-y-attribute--live-browser-confirmation-outstanding) **The empty `y`
  console check** — two minutes whenever DevTools is next open.
- Backlog [31](backlog.md#31-tooling-profilemjs-against-the-layout-rework) **`profile.mjs` re-aimed at section tabs** —
  option (B); only when a main-thread question needs per-section numbers.
- Decisions, not work, left on three stubs: roadmap [43](roadmap.md#43-robot-jobs-and-charging-stations) (parks below
  the roof), [45](roadmap.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen) (three notes) and
  [52](roadmap.md#52-job-decorations-six-small-animations-on-the-orbiters-work) (the spec questions shipped as proposed).
