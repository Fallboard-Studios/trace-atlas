# Plan

The order in which the open work gets done, agreed with Crawford on 2026-10-22. This file is an opinion, re-ordered
whenever priorities move; the records it points at are [roadmap.md](roadmap.md) (phases, numbered, never renumbered)
and [backlog.md](backlog.md) (smaller items, likewise). Nothing is described twice: each line here is a stage, a number,
one sentence and a link, and the detail, decisions and open questions live behind the link. When an item ships it
moves to the archives in the usual way and its line here is deleted.

Reading the stages: each one ends at a point where Crawford listens or looks before the next begins. "Interview" means
`/interview-me` → spec → plan before any code, as CLAUDE.md's workflow skills require.

## Stage 1 — The audio engine: two console errors, then what Light still carries

The composite voice's layer writes come first, then the underruns' design decision. The measurement for that is done,
desktop and phone (backlog 27, the two updates of 2026-10-26): the clicks at Light are the graph's standing cost, not an
accumulation, and the late collapse has not recurred.

- Backlog [40](backlog.md#40-audio-every-layer-write-re-applies-every-layers-phase) and
  [41](backlog.md#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers) **The composite voice's
  layer writes** — every layer write re-applies every layer's phase (40, sized by 37's measurement), and the composite's
  per-layer records drift from the robot's layers (41: an envelope edit restores old layer values, and a layer muted at
  build shifts later edits onto the wrong oscillator). Both are code reads, so 41 starts with the tests that confirm it.
  Crawford put them next after 37 and 38 (2026-10-26).
- Backlog [27](backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included) **The interview** — what the
  Light tier still carries on the phone (about 1 790 live nodes with two to four robots sounding) and what else it
  could cut; a change to how the audio graph is built, so interview → spec → plan, the two `main` sittings at Light as
  the baseline. Interviewed, specified and planned 2026-10-27:
  [intent](../intent/light-tier-standing-cost.md), [spec](../specs/LIGHT_TIER_STANDING_COST.md),
  [plan](../tasks/LIGHT_TIER_STANDING_COST.md) (decomposition first, Gate A picks the cuts, the Pixel sitting is the
  criterion). Next: the plan's Phase A on `perf/light-tier-standing-cost`.

## Stage 2 — The powered-down state

- Backlog [5](backlog.md#5-sector-settings-ascoordsfavorites-reorganization) **The off screen: themes, sessions,
  presets** — Crawford's plan for the powered-down state; the interview fixes the surface, including where item 7's
  selection UI goes.
- Backlog [1](backlog.md#1-onload-better-power-off-background) and [3](backlog.md#3-onload-sleeve-logo) **Off
  background art, sleeve logo** — blocked on artwork, but they land on this screen, so decided here.

## Stage 3 — The Guide

- Roadmap [51](roadmap.md#51-guide-a-read-only-branch-that-teaches-the-whole-app) **The Guide** — large; likely one
  tabbed window that shows everything. After Stage 3 so it describes the off screen as it will be.

## Stage 4 — The music

- Backlog [7](backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter) **Tagged progressions,
  seeded mood chain** — the engine, catalogue and chain (large); its UI was decided in Stage 3. Backlog
  [17](backlog.md#17-audit-lfo-drift--audio-swells--ping-variance--replayability-findings)'s audit notes feed its
  determinism design and archive once the spec absorbs them.
- Backlog [24](backlog.md#24-audio-palette-trials-transport-groove-and-tempo-walk) **Swing, then maybe a tempo walk** —
  swing is one store field and one transport write and may satisfy
  [6](backlog.md#6-audio-groove-feature) **Groove** outright; the walk only if a world feels metronomic.
- Backlog [20](backlog.md#20-audio-user-authored-progressions-and-tags-editor-ui--maybe) **User-authored progressions**
  — a maybe; only if 7 earns it, and then its own roadmap phase.

## Stage 5 — Observe the world

Interview these three together: they share one decision about what to record and what survives a reload, even if only
one is built.

- Backlog [18](backlog.md#18-telemetry-charts-of-notes-played-jobs-worked-fleet-activity) **Telemetry charts** — needs
  the visit log.
- Backlog [25](backlog.md#25-neighbourhood-map-coherent-districts-and-the-visited-log) **Neighbourhood map, visited log**
  — the map needs a world-level district field, a generation change.
- Roadmap [32](roadmap.md#32-robot-melody-history--configuration-scrubber) **Melody history / scrubber** — UI shape still
  open.

## Parked (not sequenced)

- Backlog [34](backlog.md#34-audio-upgrade-tone-once-the-leak-fix-is-latest-then-delete-the-patch) **The Tone
  upgrade** — waits for a Tone with the leak fix to be npm's `latest`; it then deletes `tonePatches.ts`.
- Backlog [39](backlog.md#39-main-thread-recurring-store-writes-fan-out-to-the-world-view-measure-first) **The world
  view's re-renders per tick** — the swell, clock and battery ticks; one profile window first, and built only if the
  `?debug` overlay shows lag spikes beside the pops once 37 and 38 are in.
- Backlog [10](backlog.md#10-visuals-atmospheric-animations) **Fog, dust, precipitation** — unspecified; light shafts
  shipped, marine snow was cut.
- Roadmap [53](roadmap.md#53-per-mover-compositor-layers) **The Safari look** — spec §5.3's manual list, passed in
  Chrome and Firefox; whenever a Mac or iPhone is to hand.
- Backlog [13](backlog.md#13-svg-invalid-empty-y-attribute--live-browser-confirmation-outstanding) **The empty `y`
  console check** — two minutes whenever DevTools is next open.
- Backlog [31](backlog.md#31-tooling-profilemjs-against-the-layout-rework) **`profile.mjs` re-aimed at section tabs** —
  option (B); only when a main-thread question needs per-section numbers.
- Backlog [23](backlog.md#23-audio-palette-trials-dynamics-processing-and-ducking) **Dynamics processing and ducking** —
  interviewed with 54 and deferred: built only if the single Compressor sounds wrong now that it is off safety duty.
- Decisions, not work, left on three stubs: roadmap [43](roadmap.md#43-robot-jobs-and-charging-stations) (parks below
  the roof), [45](roadmap.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen) (three notes) and
  [52](roadmap.md#52-job-decorations-six-small-animations-on-the-orbiters-work) (the spec questions shipped as proposed).
