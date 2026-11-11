# Plan

The order in which the open work gets done, agreed with Crawford on 2026-10-22 and re-ordered with him on 2026-11-02.
This file is an opinion, re-ordered whenever priorities move; the records it points at are [roadmap.md](roadmap.md)
(phases) and [backlog.md](backlog.md) (smaller items), which since 2026-11-02 share one counter, so a number names one
item across the three files (the overlap below 58 predates the rule and stays). Nothing is described twice: each line
here is a stage, a number, one sentence and a link, and the detail, decisions and open questions live behind the link.
When an item ships it moves to the archives in the usual way and its line here is deleted.

Reading the stages: each one ends at a point where Crawford listens or looks before the next begins. "Interview" means
`/interview-me` → spec → plan before any code, as CLAUDE.md's workflow skills require. "If needed, else archive" means
the item's own measure-first check runs, and the item archives if the check finds nothing to build.

## Stage 1 — Feature wrap-up

- Empty: its last item, backlog 72, merged 2026-11-10 (PR #617). Stage 2 is next.

## Stage 2 — Bugs and quality of life

- Backlog [13](backlog.md#13-svg-invalid-empty-y-attribute--live-browser-confirmation-outstanding) **The empty `y`
  console check** — two minutes with DevTools open.

## Stage 3 — Audio refinement

- Backlog [60](backlog.md#60-audio-cover-the-silence-when-every-active-robot-is-charging) **Cover the silence when every
  active robot is charging** — a floor on sounding robots, interviewed first; the elegant answer is backlog 7,
  post-launch.
- Backlog [17](backlog.md#17-audit-lfo-drift--audio-swells--ping-variance--replayability-findings) **The replayability
  audit** — read it against the code, then do what it points at or archive it.

## Stage 4 — Visual refinement

- Backlog [46](backlog.md#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement)
  **The world and visual draws go even** — names, colours, gems, companies, placement: the picks go even and the smooth
  walks stay, and every world's look moves once.

## Stage 5 — UX refinement

- Roadmap [51](roadmap.md#51-guide-a-read-only-branch-that-teaches-the-whole-app) **The Guide** — large; likely one
  tabbed window that shows everything.
- Backlog [61](backlog.md#61-accessibility-review) **Accessibility review** — interview the checklist, then run it.

## Stage 6 — Misc review items

- Backlog [62](backlog.md#62-misc-review-items-a-bucket) **The misc bucket** — Crawford adds findings, text content
  included, as he finds them; fixed in one pass.

## Stage 7 — Style fixes

- Backlog [63](backlog.md#63-style-fixes-a-bucket) **The style bucket** — the same, for visual chrome.
- Backlog [1](backlog.md#1-onload-better-power-off-background) **Off background art** — blocked on the artwork.
- Backlog [3](backlog.md#3-onload-sleeve-logo) **Sleeve logo** — blocked on a logo and a designer; may slip post-launch.

## Stage 8 — Launch

- Roadmap [59](roadmap.md#59-launch) **Launch** — backlog
  [45](backlog.md#45-off-screen-crawfords-three-preset-links) (the three preset links) first, as the last change that
  touches generation; then the URL, hosting, launch.

## Post-launch

- **Audio:** backlog [6](backlog.md#6-audio-groove-feature) **Groove**; backlog
  [7](backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter) **Tagged progressions, seeded mood
  chain** (17's audit notes feed its determinism design); backlog
  [20](backlog.md#20-audio-user-authored-progressions-and-tags-editor-ui--maybe) **User-authored progressions** (a
  maybe, only if 7 earns it); roadmap [32](roadmap.md#32-robot-melody-history--configuration-scrubber) **Melody
  history** (about sharing what a robot played, not metrics); backlog
  [65](backlog.md#65-robot-a-melody-strip-under-the-accents-slider-and-later-editing-the-notes) **Melody strip, then
  note editing** (interview first).
- **Stats:** backlog [18](backlog.md#18-telemetry-charts-of-notes-played-jobs-worked-fleet-activity) **Telemetry charts**
  (needs the visit log; shares its storage decision with 25).
- **World:** backlog [25](backlog.md#25-neighbourhood-map-coherent-districts-and-the-visited-log) **Neighbourhood map,
  visited log** (moving through the world; a generation change); backlog
  [10](backlog.md#10-visuals-atmospheric-animations) **Fog, dust, precipitation**.

## Parked (not sequenced)

- Roadmap [69](roadmap.md#69-the-leaner-synth-layer-robot-voices-on-native-nodes) **The leaner synth layer** — 67's
  G2b, spun off at its Gate A; 67's Gate B passed without it (2026-11-10), so it waits on a need.
- Backlog [42](backlog.md#42-audio-does-a-long-pause-on-ios-safari-come-back-measure-first) **Does a long pause on iOS
  Safari come back?** — together with roadmap [53](roadmap.md#53-per-mover-compositor-layers)'s Safari look (spec §5.3's
  manual list); both wait on a Mac or iPhone being to hand, so neither sits in a stage.
- Backlog [34](backlog.md#34-audio-upgrade-tone-once-the-leak-fix-is-latest-then-delete-the-patch) **The Tone
  upgrade** — waits for a Tone with the leak fix to be npm's `latest`; it then deletes `tonePatches.ts`.
- Decisions, not work, left on four stubs: roadmap [43](roadmap.md#43-robot-jobs-and-charging-stations) (parks below
  the roof), [45](roadmap.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen) (three notes),
  [52](roadmap.md#52-job-decorations-six-small-animations-on-the-orbiters-work) (the spec questions shipped as proposed)
  and [58](roadmap.md#58-themes-and-aspects-refinement) (whether a theme presets a Mood, once backlog 7 lands).
