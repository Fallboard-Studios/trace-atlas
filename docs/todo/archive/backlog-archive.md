# Backlog Archive

Closed items moved out of [docs/todo/backlog.md](../backlog.md) to keep that file focused on
what's still open. Item numbers are preserved exactly as they were assigned in the live backlog
— never renumbered on archive — so any existing cross-reference stays valid. Entries appear in
their original numeric order, not archive-date order.

## 8. Visuals: Job Animations

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority — deprioritized
behind launch. `JobType` (`Robot.ts`, see `docs/ROBOT_LIFECYCLE.md`) exists and is shown
as data/text (`RobotSelectionCard`, `RobotDisplaySection`), but nothing in the
actor-rendering layer visually differentiates a robot by its current job today. Genuinely
new visual work; not yet scoped.

**Closed** 2026-10-08 by roadmap Phase 43, Robot Jobs and Charging Stations (all four branches merged,
J4 = PR #544). Robots now work at host buildings: their orbiters detach and play one of six jobs'
moves (`hoverPulse`, `trace`, `ring`, `fan`, `carry`), so what a robot is doing shows in the world,
not only on its card. See [docs/ROBOT_LIFECYCLE.md](../../ROBOT_LIFECYCLE.md) and
[docs/ANIMATION_SYSTEM.md](../../ANIMATION_SYSTEM.md#job-moves).

## 9. Visuals: Better Building Details

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Low priority — deprioritized
behind launch. Factories already have a real system to extend (`docs/BUILDING_DESIGN.md`:
silhouette base + rooftop greebles + seeded facade/window/color variation) — scope is
more likely additional greeble/variant variety within that existing system than a
structural change, but not yet confirmed with Crawford.

**Closed** 2026-10-09 by roadmap Phase 44, World Gem Material (built on `feature/world-gem`; the PR is not
yet merged). Every mass in the world now wears the gem robots' bevel ring and every other solid a 1.5 px
hairline, lit by the hour's sun; silhouettes, windows and greebles are unchanged. Any greeble-variety
follow-up is a later, separate item. See [docs/BUILDING_DESIGN.md](../../BUILDING_DESIGN.md) ("World Gem
Material") and [docs/todo/roadmap.md](../roadmap.md).

## 12. IdleSystem: console.warn Fires on the Ordinary Case, Not an Error

**Closed** 2026-09-30 (`6c4657e`, branch `fixes/idlesystem-noise-wordltransition-bug`). Narrowed
`idleSystem.ts`'s guard to warn only when the robot is genuinely missing from the store
(`!robot`) — the actually-unexpected case — instead of on every non-Idle/Active state, which
most robots hit on every locale load simply by spawning Docked. Covered by new regression tests
in `idleSystem.test.ts` asserting `console.warn` fires for a missing robot and stays silent for
every ordinary docking/state combination.

## 16. `worldTransition.ts`: Retransmitting the Currently-Active Attenuation Style's Own Name Corrupts the Store

**Closed** 2026-09-30 (`fixes/idlesystem-noise-wordltransition-bug`, same branch as #12 above).
`createNewAttenuationStyle` now checks `addAttenuationStyle`'s boolean return and, on a
case-insensitive name collision, looks up and reuses the real existing entry instead of
proceeding with a phantom, never-added one. `finalizeAttenuationStyleTransition` additionally
guards its own `removeAttenuationStyle` call against the self-collision case — reusing the
*currently active* entry (a caller resubmitting its own current name, the bug's original
trigger) would otherwise delete the very entry just reused. Fixes the root cause directly in
`worldTransition.ts`, not just at the one caller (`sessionDiff.ts`) that had worked around it
before. Covered by new regression tests in `worldTransition.test.ts` (`describe('retransmitWorld
— Attenuation Style name collision')`) recreating both the "different existing entry" and
"resubmits its own current name" collisions directly, confirming `selectCurrentAttenuationStyle`
no longer dangles to `undefined` in either case. The previously-flagged "not covered by the
workaround" scope note is resolved by this fix; the deeper bookkeeping question this item's
own "needs its own scoping pass" caveat raised (what happens to the *reused* entry's own
previously-current locale) remains genuinely open but is now a documented, intentional
limitation rather than silent corruption — see the fix's own doc comments.

## 2. Onload: Power-Off Intro Text

**Closed** 2026-10-10 (`feature/layout-rework`, roadmap Phase 45; `769982a5` the world before power-on, `0bde15c3` OffScreen and the muted RadioButton, `37f3878e` the phone off screen). The powered-off screen now carries an etched label, a power hint and a Transmission row (three preset worlds and the user's saves) over the dimmed, still world. The copy is placeholder until Crawford curates it. The original request follows.

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Medium priority. Today, powering
off shows nothing but the static sleeve shell + rocker switch (`SleeveContainer.tsx` has
no off-state content at all) — a new user gets no explanation of what powering on will
do. Needs a small text block added to the off-state UI, plus actual copy explaining what
happens on power-on. Content not yet written; a placeholder can stand in until Crawford
has final copy.

## 4. Helper Text on Inputs (Info Icon)

**Closed** 2026-10-10 (`feature/layout-rework`, roadmap Phase 45; `3a5d1538` `ContentEntry.help`, `e513c808` the `HelpPopover` primitive, `7fcc49f1` the help copy for the probe and company controls). The schema-wide shape was built after all: a content entry carries `help`, `labels()` puts it on the schema and `DualLabel` renders the "?" for every control that has one. The original request follows.

Requested by Crawford (`docs/todo/temp.md`), 2026-09-11. Very low priority — mainly
blocked on the amount of content (a blurb per control) needed, not on technical
complexity. `ControlSchema` (`src/types/controls.ts`) has no helper/hint-text field
today. Concept: a small "i"/"?" icon per control that reveals a short blurb about what it
does on tap/hover. Deliberately scoped small (Crawford's own call) rather than a
schema-wide addition touching all 14 primitives.
