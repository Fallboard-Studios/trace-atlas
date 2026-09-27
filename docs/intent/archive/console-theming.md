# Intent: Console Theming (Roadmap Phase 11)

> **Status: cut.** This phase was fully implemented per the intent/spec/tasks below, then reverted at
> Crawford's call after evaluating it against the real running app — not a bug, an aesthetic call. See
> [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md) for the reasoning and what replaced it. This doc is
> kept as a historical record of what was actually decided during scoping, not current or planned
> behavior.

Confirmed via `/interview-me` on `feature/theme-and-boxes`, 2026-09-03. Splits the original combined
[Phase 11 "Console Theming & Cabinetry UI"](../todo/roadmap.md#11-console-theming) into two
roadmap items: this phase (seed-driven CSS theming, scoped below) and a new deferred
[Phase 11.1 "Oblique Cabinetry UI"](../todo/roadmap.md#1111-oblique-cabinetry-foundation--button) (not yet
interviewed/specced). An earlier design comp existed for the combined phase but is explicitly
discarded — not a reference for this document; treat this as a fresh scoping pass against the
roadmap's own Phase 11 prose, not a resumption of that comp's decisions.

## Outcome

A pure, seed-driven color theming system for the console's Glass-side UI —
`src/utils/consoleTheme.ts` computing bounded HSL values for `--color-bg`/`--color-surface` from the
AS seed and `--color-accent`/`--color-border` from the active locale's coordinate seed, replacing
today's static Vite-default palette (`src/index.css`).

## User

Crawford (solo dev) — the payoff is the "field equipment reporting what it's tuned to" fiction the
rest of the console already leans on (`SYSTEM_FIRMWARE_RESETS`, the power-off confirm) actually being
true for the console's own appearance: retransmitting a seed visibly recolors it.

## Why now

A real, buildable, self-contained slice on its own — and a genuine prerequisite for Oblique
Cabinetry (Phase 11.1), which needs trustworthy seed-derived tokens to compute its cabinet
face-shading from, rather than a theoretical dependency. Splitting it out lets that dependency be
real and verified before Cabinetry's own (much larger, still-undecided) scope is tackled.

## Success

- Every possible AS seed / locale coordinate seed pair produces a legible result: colors clear WCAG
  AA (4.5:1 normal text / 3:1 large text/UI components) against the app's fixed dark theme, for every
  seed — not just the seeds used in manual testing. This is the property to test, not eyeball.
- No static/fixed color palette or lookup table anywhere in the implementation — colors are computed
  from the seed, same rule `ROBOT_DESIGN.md` already enforces for robots.
- Retransmitting a new seed in Sector Settings (Phase 5) visibly and immediately updates
  `--color-bg`/`--color-surface`/`--color-accent`/`--color-border` via a plain CSS transition (not
  GSAP/timeline-worthy), honoring `prefers-reduced-motion` (snaps instead of animating, same pattern
  as `PowerRockerSwitch.css`).
- `Console.css`'s existing `.console` rule (which locally overrides `--color-surface` to a fixed
  `rgba(26, 26, 26, 0.75)` for the hub's glass translucency) is resolved so the seed-derived surface
  color actually reaches inside `.console` rather than being silently shadowed by the more specific
  rule — either by applying the seed-derived value directly at `.console`, or by re-deriving the
  translucent variant from the same seed value.
- Theme values are computed once per AS/locale activation and applied (e.g. inline styles on a root
  element), not recomputed on every render.
- `docs/CONSOLE_THEMING.md`'s "not yet implemented" banner is updated once `consoleTheme.ts` lands.

## Constraint

- **`--color-text-primary`/`--color-text-muted` stay fixed — not seed-derived.** Legibility for the
  body/label text read throughout every drawer wins over full-palette variety; only
  `--color-bg`/`--color-surface` (AS-tier) and `--color-accent`/`--color-border` (locale-tier) become
  computed. This narrows the roadmap's original Phase 11 prose (which grouped "button/text colors"
  together under the locale tier) — confirmed explicitly during the interview.
- WCAG target is **AA**, not AAA — chosen deliberately over the stricter bar, which would likely
  flatten the seed-driven variety this phase exists to produce ("Attenuation Styles stay genuinely
  distinguishable at scale," per `docs/CONSOLE_THEMING.md`), and text itself (the strictest
  contrast case) isn't part of what's being generated per the constraint above.
- Bounded HSL ranges must be tighter than `ROBOT_DESIGN.md`'s robot precedent (saturation 30–100%,
  luminance 20–72%) — this is real interactive chrome, not a decorative shape a bad roll can shrug
  off. Exact numeric bounds are left open, to be derived during spec-driven-development against the
  AA contrast requirement rather than picked here.
- The exact variety-generation technique (how two AS seeds with a similar hue stay visually distinct)
  is explicitly left open, per `docs/CONSOLE_THEMING.md`'s own framing: the requirement is the
  outcome, not a specific mechanism. Not settled by this interview.

## Out of scope

- **Oblique Cabinetry** (the 2.5D SVG/GSAP rendering system for the 7 interactive primitives) — split
  out to its own future roadmap item, [Phase 11.1](../todo/roadmap.md#1111-oblique-cabinetry-foundation--button),
  to be interviewed and specced separately once this phase's tokens exist and are trustworthy.
- WorldView/terrain/sky styling (deferred to v2), robot visuals (locked to `audioAttributes` per
  CLAUDE.md's Visual Mapping guardrail), `SleeveContainer`, and the power rocker switch — all already
  excluded by `docs/CONSOLE_THEMING.md`'s existing "What This Is Not" section, unchanged by this
  interview.
- Picking the final numeric HSL bounds and the variety-generation technique (see Constraint above) —
  left for the spec-driven-development pass that follows this intent doc.

## Forward Note

`docs/todo/roadmap.md` has already been split as part of confirming this intent: "11. Console
Theming & Cabinetry UI" became theming-only "11. Console Theming," a new "11.1 Oblique Cabinetry UI"
holds the deferred Cabinetry scope (carrying over the original combined phase's draft prose as a
starting point, not a settled spec), and the former "11.1 Cabinetry Verification" is renumbered
"11.2." No other docs (`docs/CONSOLE_THEMING.md`, `CLAUDE.md`'s reference list, etc.) were touched by
this split — they still describe the combined phase and should be revisited once this phase's spec
is written.
