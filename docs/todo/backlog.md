# Backlog

Tracks todos, bug fixes, and cleanup items that aren't part of a roadmap phase — either
surfaced by a `/code-review-and-quality` pass (or similar) on unrelated feature work, or
raised directly by Crawford as a smaller idea that doesn't warrant its own roadmap phase.
Distinct from `docs/todo/roadmap.md`, which tracks features/phases with their own
Create/Restructure/About/Docs shape.

Not a spec — this is a review-output backlog. Each item gets its own `/interview-me` or
spec pass (as warranted by its size) when picked up; check it off here once merged. Not
itself one of CLAUDE.md's Reference docs.

See also [docs/DUPLICATE_VALUE_AUDIT.md](DUPLICATE_VALUE_AUDIT.md) — a dedicated sibling
backlog for one specific bug class (independently-declared duplicate values) rather than a
duplicate of this doc.

Rewritten 2026-09-27: a full audit against git history found several fully-resolved items
still saying "not yet merged" (the underlying branches had merged months earlier — the doc
had just never been updated after the fact) and a few whose entire subject had since become
moot through later, unrelated work. Those are pruned outright below rather than kept as
closed-and-noted — git log is the record of what shipped; this file only tracks what's
still actionable. Anything genuinely still open is carried forward unchanged.

Going forward, a fully-closed item moves to [docs/todo/archive/backlog-archive.md](archive/backlog-archive.md)
instead of being pruned outright, keeping the closure's own detail around. Item numbers are
never reused or renumbered when an item moves.

## Open items

### 1. Onload: Better Power-Off Background

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority. Today, powering
off shows nothing but the static sleeve shell + rocker switch — no distinct background
art. Crawford wants to swap in something more considered, possibly one of his own
abstract paintings. Pure asset + `background` CSS swap on `SleeveContainer.css` — no
architecture impact. Blocked on Crawford supplying the artwork.

### 2. Onload: Power-Off Intro Text

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority. Today, powering
off shows nothing but the static sleeve shell + rocker switch (`SleeveContainer.tsx` has
no off-state content at all) — a new user gets no explanation of what powering on will
do. Needs a small text block added to the off-state UI, plus actual copy explaining what
happens on power-on. Content not yet written; a placeholder can stand in until Crawford
has final copy.

### 3. Onload: Sleeve Logo

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority.
The project name is final ("Trace Atlas") and the sleeve already shows it as a text
wordmark — a CSS `::before` pseudo-element on `.sleeve-container__bottom-strip`
(`SleeveContainer.css:116-133`, uppercased, centered), not markup in `SleeveContainer.tsx`.
Crawford wants a real image logo, bottom-right — open question whether it replaces the
text wordmark or sits alongside it. Blocked only on the logo artwork itself (a favicon
cube, `public/favicon.svg`, exists but isn't a wordmark-scale logo).

### 4. Helper Text on Inputs (Info Icon)

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Very low priority — mainly
blocked on the amount of content (a blurb per control) needed, not on technical
complexity. `ControlSchema` (`src/types/controls.ts`) has no helper/hint-text field
today. Concept: a small "i"/"?" icon per control that reveals a short blurb about what it
does on tap/hover. Deliberately scoped small (Crawford's own call) rather than a
schema-wide addition touching all 14 primitives.

### 5. Sector Settings: AS/Coords/Favorites Reorganization

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority. Today's
`ATTENUATION_STYLE_PRESETS` (`sectorSettingsConfig.ts`) is what Crawford means by
"favorites" — same concept, different name; not a new feature so much as a reframing
plus a data refresh. Crawford has been separately keeping his own list of good
Attenuation Style + coordinate combinations; once roadmap Phase 21 (Sector Settings:
Shareable Link Import/Export) lands, he wants to update the in-app preset list with
current, shareable links, alongside reorganizing how AS/coordinates/presets are laid
out in the Sector Settings panel. Depends on Phase 21 for the "shareable link" half —
Session Storage (Phase 20) alone only makes a link possible via the address bar, not
an in-app Export/Import action.

### 6. Audio: Groove Feature

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. A new mechanic: a "groove" value that raises the odds of robots syncing
their rhythm to other robots while docked/recharging. Would touch `robotSystems.ts`'s
docking logic and melody/rhythm generation. Not yet scoped — open question is whether
"groove" is a single global dial (e.g. a Sector Settings or Audio Rig control) or a
per-robot/per-locale value.

### 7. Audio: More Chord Progressions + Selection UI

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. `HARMONY_PALETTES` (`harmonySystem.ts`) is a fixed array, sequentially
cycled automatically (the `feature/harmony-palette-update` rewrite — see project memory
— is confirmed merged) with no user-facing selection at all. Adding more palettes is
straightforward; adding a way to choose them is the real feature — needs a new UI
control, location not yet decided (Sector Settings vs. Audio Rig are the likely
candidates).

### 8. Visuals: Job Animations

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority — deprioritized
behind launch. `JobType` (`Robot.ts`, see `docs/ROBOT_LIFECYCLE.md`) exists and is shown
as data/text (`RobotSelectionCard`, `RobotDisplaySection`), but nothing in the
actor-rendering layer visually differentiates a robot by its current job today. Genuinely
new visual work; not yet scoped.

### 9. Visuals: Better Building Details

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. Factories already have a real system to extend (`docs/BUILDING_DESIGN.md`:
silhouette base + rooftop greebles + seeded facade/window/color variation) — scope is
more likely additional greeble/variant variety within that existing system than a
structural change, but not yet confirmed with Crawford.

### 10. Visuals: Atmospheric Animations

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority — deprioritized
behind launch. No weather/atmosphere/particle system exists in `WorldView` today — this
would be genuinely new (fog, dust, light rays, precipitation, or similar — not yet
specified). Not yet scoped.

### 11. Visuals: Small Immersion Animations

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. Likely a grab-bag of minor polish (idle bobs, blinking lights, and similar
small touches) rather than a single feature; exact list not yet defined.

### 12. IdleSystem: console.warn Fires on the Ordinary Case, Not an Error

Found while checking console output live (2026-09-14) — Crawford flagged the console as
overwhelming on load; this is one concrete, fixable source. Low risk, high noise
reduction. Re-confirmed 2026-09-27 against current source — still unfixed, `idleSystem.ts`
line number unchanged.

`Robot.tsx:66` calls `handleRobotIdle()` unconditionally on every robot's mount (with
`isReturning: true`, to land its first on-screen destination in the bottom half — see the
comment above that call). `idleSystem.ts:117` only proceeds past its guard when that robot
is already `Idle`+`Active`; anything else — including `docked`, the state most robots
actually spawn in — hits `console.warn('[IdleSystem] Robot ... not found or not
Idle/Active ...')` and returns early. Since most robots spawn docked, this warns on the
*ordinary, expected* path for 10 of 12 robots on every locale load, and again on every
state transition. React's dev-mode component-stack-on-warn feature turns each one into a
large internals dump, dominating the console on load and during normal play.

Not a functional bug — the guard's early return is correct — purely a log-level/hygiene
problem: an expected, common precondition-not-met is logged as a warning.

**Fix shape:** drop the log entirely, or narrow it to only the case that's actually
unexpected (`!robot` — robot missing from the store) rather than every non-Idle/Active
state.

### 13. SVG: Invalid Empty `y` Attribute — Live-Browser Confirmation Outstanding

**Status:** fix merged to `main` via PR #469 (`7eb1f67`), 2026-09-15 — confirmed still
present at `PowerRockerSwitch.tsx:314` (`y={POWER_SVG_REST.y}`). Only the live-browser
confirmation remains genuinely open; no evidence since of that check having happened.

`PowerRockerSwitch.tsx`'s nested `.rocker-power-svg` (the power icon inside the rocker
switch) was the one element in the codebase whose `y` position was never set in JSX at
all — set only by `useGSAP`'s `gsap.set(powerSvgEl, { attr: { y: POWER_SVG_REST.y } })` on
mount, so on the very first paint the attribute was absent/invalid. The fix gives the
`<svg>` an explicit `y` default in JSX so a valid value exists from the very first paint;
GSAP still owns the tween from there. Covered by a `PowerRockerSwitch.test.tsx` regression
test. **Not yet confirmed in a live browser** — the hypothesis is strong (the one
component matching the bug's exact shape) but the real Chrome console output was never
watched directly for it.

### 14. Live-Profiler Reverification Still Pending (3 spots)

The `refactor/factory-timing` performance series (merged to `main` via PR #465, `e55e846`,
2026-09-14/15) fixed a long chain of re-render bugs — most were live-verified with
Crawford and React DevTools Profiler at the time and are fully closed. Three specific
fixes in that same series still haven't gotten their own live-Profiler recheck:

- **`RobotBody`'s lighting/audio-shape split** (`RobotBody.tsx` — `audioVisual` vs.
  `colors` memos) — code fix landed and unit-tested (a regression spy confirmed the
  wasted recompute before the fix), but never re-checked live in the Profiler the way the
  sibling `Factory`/`BubbleStream` fixes were.
- **Once/sec lighting-tick batching smoothness** (`AttenuationStyleView.tsx`'s
  `React.startTransition` wrap) — doesn't reduce total work, only lets React spread/
  interrupt it; whether the commit visibly spreads across multiple frames now (and feels
  less spiky) still needs a live look.
- **`RobotOptionsTab`/`CompanyOptionsSection` memoization** — the fix and its cascade
  regression tests are merged and passing, but note the file shape has since moved on:
  both components were later rewritten to render through a shared
  `RobotSectionAccordionStack` (roadmap Phase 28, Robot Section/Subsection Config
  Consolidation) — any specific file:line citations from the original fix are stale, but
  the underlying stabilized-callback/memo pattern is confirmed still present (a `// Task 6`
  comment referencing the original fix survives the restructure). Re-verify against
  current code, not old line numbers, when this gets checked.

### 15. Test Suite: Three Tests Fail Intermittently Under a Full Parallel Run

**Status:** ☐ open — noticed 2026-09-18, still reproducing as of 2026-09-27 (see project
memory: known-flaky unmocked-random tests).

Three tests fail occasionally in a full `npx vitest run` and pass every time when their own file is run alone (3–5 isolated runs each):

- `src/systems/audioSwells.test.ts` › *pingVarianceAutomation forced return at 0% (Task 4) › forces every member of a company-wide swell together, sharing phase/timing, each landing exactly on its own baseValue* — failed in 4 of 7 full runs.
- `src/components/company/CompanyCrudControls.test.tsx` › *Rename Submit button › is (normally) enabled immediately after selecting a company — the auto-suggested draft differs from the current name* — failed in 2 full runs, one of them on the commit *before* any 17.2.2 work.
- `src/systems/factoryPlacementSystem.test.ts` › *recolorFactoriesForAttenuationStyle › changes only config.hueShift/config.satShift on every factory — everything else round-trips byte-identical* — failed in 1 full run.

Both known failures since (per project memory) are real-RNG preconditions, not assertion
bugs — re-run once to confirm rather than retry-looping or editing assertions. All three
suggest a shared, load- or order-dependent input (wall-clock time, seeded randomness that
isn't fully pinned, or a timing-sensitive assertion). Worth a look before a CI gate is
added (there is none yet — see `CLAUDE.md`'s PR process note), since a flaky gate trains
people to re-run instead of read.
