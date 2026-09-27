# Intent: Robot Selection Filter Panel — Polish Pass

Confirmed via `/interview-me` on 2026-09-15. Follow-up to [robot-selection-filter-panel.md](robot-selection-filter-panel.md)
(the original filter-panel build, shipped on `feature/company-cleanup`): fixes a live bug in the mobile/tablet
slide-over, adds a close affordance the original intent's own open question (§7.1 of
[ROBOT_SELECTION_FILTER_PANEL.md](../specs/ROBOT_SELECTION_FILTER_PANEL.md)) left unresolved, reworks the panel's
sizing/positioning on every tier, and closes a color-collision gap in company spawn generation that's unrelated to
the panel itself but was raised in the same session.

## Outcome

**1) Slide-in bug fix (mobile/tablet):**
[RobotFilterPanel.tsx](../../src/components/panels/screen/console/RobotFilterPanel.tsx)'s GSAP timeline
(`animateTo`, driving `xPercent` on open/close) doesn't actually slide the panel fully into view today — it barely
appears at the left edge of the screen instead of covering it as designed. Root cause not yet diagnosed (candidates
include the `xPercent` tween interacting badly with the stylesheet's own static `transform: translateX(-100%)`
baseline in [RobotFilterPanel.css](../../src/components/panels/screen/console/RobotFilterPanel.css), or a
containing-block/clipping issue from `.robots-tab`'s `position: relative`). This is a bug fix — the intended
end-state (panel slides fully into view, covering the robot list, exactly as `RobotFilterPanel.css`'s own comments
and the original intent describe) is unchanged.

**1a/1b) Close button + accessible labels:**
- A new "close" button renders at the top of the filter pane, mobile/tablet only (desktop's panel has no
  toggle/close button — it's always on screen, per the original intent).
- The existing toggle button (`FILTER_TOGGLE_SCHEMA`) stays mounted and in the tab order even while the open panel
  visually covers it — no `aria-hidden`/`inert`/focus-trap work requested.
- Accessible label changes with state, both built from the existing `FILTER_TOGGLE_SCHEMA.humanLabel = 'Filters'`:
  toggle reads **"Show Filters"**, the new close button reads **"Hide Filters"**. This resolves the open question
  the original spec left at §7.1 item 1 (`aria-expanded` vs. a state-changing accessible name) in favor of the
  accessible-name approach, now made concrete with two separate buttons rather than one toggle whose own label
  flips.

**2/2a) Sticky, content-sized panel — all tiers:**
- On every tier, the panel sizes to its own content — never stretched to the robot list's height or the screen's
  full height. This replaces mobile/tablet's current `top: 0; bottom: 0` full-height overlay
  ([RobotFilterPanel.css](../../src/components/panels/screen/console/RobotFilterPanel.css)) with a content-height
  box positioned at the same top-left spot the toggle already occupies — which is *why* the open panel currently
  covers the toggle (motivating 1a): it's short, but it starts exactly where the toggle sits.
- On every tier, the panel is `position: sticky` so it stays on screen while the robot list scrolls by, then
  scrolls away once the list itself ends. On desktop this changes today's `position: static` (panel currently
  scrolls away with the rest of the page like any other in-flow content — see
  [robot-selection-filter-panel.md](robot-selection-filter-panel.md), which only specified "always visible... to
  the left of the list," not sticky). On mobile/tablet this replaces the current full-height absolute overlay.
- The slide-in/out animation (item 1) is kept — it now animates a sticky, content-height box onto screen instead of
  a full-height one; the GSAP-timeline constraint from the original intent (`timelineMap`,
  `prefers-reduced-motion`) still applies unchanged.

**3) Company color collisions — close an existing gap:**
Two independent code paths assign a company its identity color, and only one of them dedupes:
- [CompanyCrudControls.tsx](../../src/components/company/CompanyCrudControls.tsx)'s `pickRandomCompanyColor`
  (manual creation) already re-rolls against every color currently in use by an existing company in the locale
  (bounded to `ROBOT_IDENTITY_COLOR_NAMES.length` attempts) — per `docs/specs/COMPANY_SECTION_ENHANCEMENTS.md`
  §1.2.
- [spawnSystem.ts](../../src/systems/spawnSystem.ts)'s `generateCompanyIdentityColor` (seeded initial-load spawn)
  does **not** — each company's color is an independent `getSeededVal` draw into
  `ROBOT_IDENTITY_COLOR_NAMES`, with no check against colors already assigned earlier in the same spawn pass. With
  `MAX_COMPANIES = 6` companies drawn independently from an 18-color palette, collisions are a real (not
  theoretical) possibility.
- Fix: apply the same "skip colors already assigned" logic to the spawn-time path, closing the gap rather than
  introducing a new shared "pool" data structure — confirmed in interview ("close the gap if we already have an
  implementation in place"). The spawn-time fix must stay fully deterministic (seeded draws only, no
  `Math.random`, per `CLAUDE.md`'s guardrails and `PROCEDURAL_GENERATION.md`) — e.g. bounded re-draws against
  later `getSeededVal` rows on collision, mirroring `pickRandomCompanyColor`'s bounded-retry shape without its
  actual randomness source.
- Scope is per-locale, matching `pickRandomCompanyColor`'s existing scope (dedupes against `companies` in the
  current locale only, not across locales/sessions) — companies are locale-scoped throughout
  (`docs/COMPANIES.md`).

## User

Crawford (solo dev) — polishing the filter panel just shipped in `feature/company-cleanup`, plus fixing an
independently-noticed color-generation gap in the same area of the codebase (company creation).

## Why now

The filter panel (from [robot-selection-filter-panel.md](robot-selection-filter-panel.md)) shipped this cycle but
has a live, user-visible animation bug plus positioning that doesn't hold up under actual use (covers its own
toggle, scrolls away instead of staying reachable). The color gap was noticed as a related loose end in the same
company-management surface.

## Success

- Mobile/tablet: tapping the toggle slides the filter panel fully into view (no more "barely appears on the left").
- Mobile/tablet: a close button at the top of the open panel reads "Hide Filters"; the covered toggle (still
  mounted/focusable) reads "Show Filters".
- All tiers: the panel is exactly as tall as its content (never full robot-list or full-screen height) and uses
  `position: sticky` so it's reachable on screen while the robot list scrolls — permanently visible on desktop
  (per the original intent), visible whenever open on mobile/tablet.
- `spawnSystem.ts`'s `generateCompanyIdentityColor` never assigns a company the same color as another company
  already spawned in the same locale, using the same deterministic-seeding approach the rest of procedural
  generation uses (no `Math.random`).
- `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.

## Constraint

- Per `CLAUDE.md`: the slide animation stays a GSAP timeline registered in `timelineMap`
  (`setTimeline`/`killTimeline`), respecting `prefers-reduced-motion` — unchanged from the original intent's own
  constraint, just now applied to a content-height/sticky box instead of a full-height one.
- Company color generation must stay deterministic and seeded (`getSeededVal`, no `Math.random`) on the spawn path
  — `pickRandomCompanyColor`'s genuine randomness is fine to keep as-is for manual creation, but must not leak into
  the spawn-time fix.
- No new persistent/shared "color pool" module — the fix closes the gap by extending
  `generateCompanyIdentityColor`'s own existing dedup-against-used-colors pattern (mirroring
  `pickRandomCompanyColor`'s shape), confirmed in interview rather than assumed.

## Design discussion (2026-09-15, via `/interview-me`)

- **Toggle visibility while covered:** First asked whether the toggle should hide/unmount while the panel is open.
  Confirmed: stays in the DOM, unchanged — the panel simply covers it visually; no focus-management change
  requested.
- **Sticky scope:** First guessed (wrongly) that "sticky" might mean desktop-sidebar-only, with mobile/tablet
  staying a full-height overlay. Corrected: the whole visible filter panel should be sticky, on every tier.
- **Panel height:** First guessed (wrongly) that content-height sizing might only apply to desktop, with
  mobile/tablet staying a full-height drawer (reasoning that 1a's "covers the toggle" note implied a tall drawer).
  Corrected: the panel should be content-height everywhere — it's short, but positioned at the toggle's own
  top-left spot, which is why it currently covers the toggle. "The user should always see the company filters on
  screen while scrolling with the filters open (or, if on desktop, all the time, since the filters are always
  visible)" is the actual requirement driving the sticky behavior.
- **Color fix scope:** First framed by the user as "a pool of currently used company colors" (suggesting a new
  shared data structure). Clarified via direct code check (both color-assignment call sites read before asking)
  that manual creation already implements exactly this dedup logic locally, and only the spawn-time path is
  missing it. User confirmed: close the gap in the existing implementation rather than building a new pool
  abstraction.

## Out of scope

- Root-causing the slide-in bug beyond "fix it so the panel slides fully into view" — exact mechanism
  (transform/xPercent conflict, clipping, or something else) is an implementation-phase investigation, not decided
  here.
- Any backdrop/scrim behind the open panel — the original intent's own open question (§7.2), still not decided,
  and arguably less relevant now that the panel no longer covers the full screen.
- Any color-editing/re-roll UI for existing companies (none exists today, none requested).
- Cross-locale color uniqueness — the fix is scoped per-locale, matching the existing manual-creation dedup.
- `aria-expanded` on the toggle button — the original spec's alternative option, superseded by this intent's
  two-button/state-changing-label approach.

## Downstream

Hand this confirmed intent to `spec-driven-development` next if the slide-in bug's root cause turns out to need
real design decisions (e.g. a CSS/positioning restructure beyond a one-line fix); otherwise `test-driven-development`
directly against this intent is likely sufficient given the small, well-bounded surface area (one component's CSS
positioning + GSAP tween, two new button states, one function in `spawnSystem.ts`).
