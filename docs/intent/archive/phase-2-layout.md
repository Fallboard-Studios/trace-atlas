# Intent: Layout (Roadmap Phase 2)

Confirmed via `/interview-me` on `review/audio-engine-break-up`, 2026-08-21. This is the
"why" behind Phase 2's scope in
[docs/todo/roadmap.md](../todo/roadmap.md#2-layout) — read that first for the
roadmap's own framing; this doc resolves the decisions its prose left open (and corrects
two lines that don't match the current codebase — the roadmap was partially drafted by
Gemini without repo access).

**Amendment (2026-08-21, during Task 7/8 implementation):** the sleeve's width was
changed to a fixed `200px` for both `SleeveContainer` instances (was `100%`), confirmed by
Crawford after reviewing a screenshot. One consequence, confirmed as accepted rather than
a regression: the "strip runs along the top of the viewport" description below no longer
holds literally — capped at 200px total width, the strip is now a small ~10px sliver next
to the power corner, not a strip spanning the rest of the tablet's width. See
[docs/tasks/LAYOUT.md](../tasks/LAYOUT.md) Task 7 for the implementation-level detail.

## Outcome

Collapse the sleeve's power-switch column down to a small cutaway so `ScreenViewport`
stretches to fill the freed space, and put a sticky mute+metadata bar in that space that
stays pinned at the top at every viewport size. This replaces the old `TransportBar` and
removes the mobile/desktop layout split entirely — one shell, no viewport-based
reorientation, anywhere.

**Sleeve cutaway** (`SleeveContainer`, the one with `hasPowerSwitch`):
- Its matte area cuts away to the right of the power switch. `ScreenViewport` grows to
  fill that space (the viewport now starts at the top of the tablet, not below a
  full-height sleeve column).
- `PowerRockerSwitch` z-indexes over `ScreenViewport`'s top-left corner. `ScreenViewport`
  CSS keeps its own content from rendering under that corner (padding/margin exclusion
  around the switch's bounds) — the switch stays DOM-owned by `SleeveContainer` per the
  existing guardrail (it's the one interactive thing already allowed there); nothing
  about mute/metadata moves into `SleeveContainer`.
- A distinct ~16px strip of sleeve material still runs along the top of the viewport, to
  the right of the power switch (new markup/CSS on `SleeveContainer`, not to be confused
  with `ScreenViewport`'s own existing decorative top-rail SVG, which stays as-is
  underneath/adjacent to it).

**Mute + metadata bar** (replaces `TransportBar`):
- Remove restart and pause/play entirely — no replacement, anywhere.
- Keep the mute toggle as a user helper.
- Add a metadata readout: planet name (the seed — `derivePlanetSeed` takes the planet's
  *name* as input, so "planet seed" and "planet name" are the same value in this
  codebase), locale coordinates, BPM, and time (hour:min). All of this already exists in
  `planetStore`/`localeStore`/`audioStore`/`constants/time.ts` — read directly, no new
  data file.
- `position: sticky; top: 0` at every viewport size — removes the existing
  `@media (min-width: 48em)` rule in `TransportBar.css` that silently turns stickiness
  off on tablet/desktop today.
- Layout: mute + metadata sit in one row when there's room to the right of the power
  switch cutaway; metadata wraps to a new line when there isn't. This is a content-driven
  `flex-wrap`, not a new viewport-breakpoint override — it doesn't reintroduce the
  reorientation logic this phase is removing.

**Removed outright:**
- `RobotList` (component + CSS) — deleted, not parked. Phase 8's "Robot Selection" tile
  (avatar/job/battery status, per `docs/UI_SHELL.md`) is different enough in shape that
  there's nothing worth reusing.
- `ScreenViewport.css`'s `@media (min-width: 64em)` two-column grid reorientation
  (`transport+worldview | robotlist`, `console` spanning) — single-column grid
  (mute/metadata bar → `WorldView` → `Console`) at every size, now that the robotlist row
  is gone too.
- `Tablet.css`'s `min-width: 48em`/`64em`/`80em`/`92em` rules — the row-flip
  (`flex-direction: row`, landscape sleeves-beside-screen) and the progressive
  960→1200→1440px widening both go. Sleeve/viewport/sleeve stay stacked in a column at
  every size, matching mobile exactly, just at whatever size the viewport happens to be.

**Explicitly stopped short of, deferred to Phase 3:**
- `ConsoleNavigation` (the Radix `Tabs.Root` bar, called "Console" in code) stops being
  rendered from this layout, but its component code and `uiStore.activeConsoleTab` are
  left untouched. Phase 3 owns the real teardown and rebuild into a tile-based `HubNav`.

## User

Crawford, building solo. This locks the shell down so later phases (Hub tiles in Phase 3,
Robot Selection in Phase 8, etc.) build against one stable layout instead of the current
mobile/desktop split.

## Why now

Phase 2 was next up on the roadmap. The prior `/context-engineering` prep pass surfaced
that the current desktop layout silently un-stickies the transport bar
(`TransportBar.css:100-104`) and reorients into both a 2-column content grid and a
landscape tablet frame — dead weight now that the confirmed design direction is "desktop
is just a bigger mobile."

## Success

- One layout shell, no viewport-based reorientation anywhere in `ScreenViewport.css` or
  `Tablet.css` — only the mute/metadata row's content-driven wrap.
- Mute + planet name/coordinates/BPM/time are visible and sticky at the top at every
  screen size.
- The sleeve cutaway renders correctly: power switch z-indexed over the viewport corner,
  ~16px sleeve strip to its right, no interactive content rendering under the switch.
- `RobotList` and the old transport controls (restart, pause/play) are gone with no
  replacement.
- `ConsoleNavigation` renders nothing but its code is untouched, ready for Phase 3.
- `docs/UI_SHELL.md`'s Overview line is updated per the roadmap's own Docs note, now that
  `RobotList` and most of `TransportBar` are gone.

## Constraint

Stays inside the repo's existing non-negotiable guardrails
([CLAUDE.md](../../CLAUDE.md)):
- All interactive UI stays inside `ScreenViewport`; `SleeveContainer` keeps only the
  power switch. The cutaway is a pure CSS/z-index visual effect, not a DOM move.
- State stays serializable — no new `uiStore` fields anticipated; the metadata bar reads
  existing store values directly.

## Out of scope (this phase)

- No new `src/data/localeMetadataConfig.ts` — the roadmap's proposed file isn't needed;
  every value the metadata bar shows already lives in existing stores/constants. Treat
  that roadmap line as superseded.
- No new `src/utils/planetTime.ts` — `src/constants/time.ts`'s `computePlanetHour`/
  `computeLocalTime` already derive strictly from planet size and are already used by
  `planetStore.ts`, `PlanetView.tsx`, `LocaleView.tsx`, and `TransportBar.tsx`. Treat that
  roadmap line as superseded too.
- `ConsoleNavigation`'s actual teardown and the tile-based `HubNav` rebuild — Phase 3.
- `RobotList`'s replacement ("Robot Selection" tile) — Phase 8.
