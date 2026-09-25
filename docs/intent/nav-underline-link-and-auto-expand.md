# Intent: Underline Link & Nav Panel Deepest-Level Auto-Expand

Confirmed via `/interview-me`. Two related changes: a new `UnderlineLink` UI primitive, and a styling/behavior pass on the nav panel's deepest tree levels that consumes it.

## Outcome

**1. `UnderlineLink` component (new primitive)**

- A thin, purely decorative 4px-tall underline that sits beneath a text label — it renders no text of its own.
- On hover/focus/activation, it protrudes 4px using a genuinely simplified version of `CabinetBox`'s own cabinetry pop language (a visible top-face/side-face "wall" edge as it pops out), not just a drop-shadow or offset trick — consistent with the rest of the design system's tactile hover idiom.
- Its accent color is passed in from the caller — it does not resolve trait/color itself; the caller hands it whatever color the row already resolved to (see Success below).

**2. Nav panel — deepest two levels restyle**

- For the two deepest tree levels of each branch, replace the row's current `CabinetBox`-wrapped `Button` chrome with: a plain text label + `UnderlineLink` beneath it. No boxed button surface at these levels anymore.
  - Settings / Fleet Params (3 levels total: branch → mid → leaf): mid and leaf levels get this treatment (e.g. Quality/Presets AND their own children like Robot Load/Effects Load; Pacing/EQ & Filters/etc. AND their own leaves like Tempo/3-Band EQ).
  - Probes / Companies (4 levels total: branch → entity → section → subsection): section and subsection levels get this treatment (e.g. Composition/Envelope AND their children like Rhythm/Pitches). The entity level itself (an individual robot, "All Probes", or a company) is NOT included — it keeps today's full `CabinetBox`+`Button` row.
- These rows also become visibly shorter than today's full boxed rows — no fixed target height yet; pick a reasonable first-pass value (noticeably shorter, roughly the underline's own minimal height plus label line-height) for Crawford to tune during his usual manual visual review.
- Top-level (branch) rows and entity-level (robot/All Probes/company) rows are unchanged — same `CabinetBox`+`Button` chrome as today.

**3. Nav panel — deepest-parent auto-expand**

- Whenever a node becomes expanded — by any mechanism (its own `+/-` toggle click, or the existing ancestor-auto-expand-on-select behavior) — its own deepest "parent" child level (a child that itself has children) auto-expands too, cascading down as far as the tree actually goes.
  - Expanding "Settings" auto-expands "Presets"/"Quality" too, immediately revealing their own children.
  - Expanding "Fleet Params" auto-expands all 4 groups (Pacing, EQ & Filters, Time & Space, Output), immediately revealing their leaves.
  - Expanding a real robot, "All Probes", or a company does NOT auto-expand that entity row itself — it stays collapsed even though it structurally qualifies as a "parent." Once the user DOES expand it (manually or via ancestor auto-expand), its own children (sections: Output/Composition/Envelope/Source) auto-expand in turn.
- This is one unified rule applied uniformly regardless of how a node became expanded — not two different behaviors for toggle-click vs. select-driven ancestor expansion.

## User

You (Crawford), continuing the nav panel polish pass on Trace Atlas.

## Why now

The nav tree just grew a 3rd/4th level in several branches (Settings → Quality/Presets, Fleet Params → Pacing) — this pass makes that deeper tree legible (shorter, denser rows at the bottom) and gives hover/focus/active a consistent tactile affordance matching the rest of the design system, rather than every depth looking identical.

## Success

- `UnderlineLink` exists as a standalone, reusable primitive taking a color prop, with no text of its own.
- The two deepest levels of every branch render as plain-text-label + `UnderlineLink`, visibly shorter than today, with the underline colored by whatever trait color that row already resolves to today (`node.trait ?? inherited-ancestor-cascade`, unchanged) — no new color-resolution logic anywhere.
- Expanding any node cascades expand-state down through every subsequent "parent" level, except it never auto-expands an entity row (robot/All Probes/company) itself.
- Branch-level and entity-level rows are visually and behaviorally unchanged from today.

## Constraint

- Reuse existing trait/color cascade exactly as it works today — this is "wire the existing resolved value into the new component," not new logic.
- Exact row height/spacing values are first-pass, confirmed later in Crawford's manual visual review — not specified now.
- Respects existing guardrails: no interactive UI outside `ScreenViewport`, `UnderlineLink` itself has no GSAP timeline needs (a CSS hover/focus/active transition is sufficient, matching `CabinetBox`'s own precedent of only using GSAP for its animated pop tween, not static hover states).

## Out of scope

- Any change to `CabinetBox` itself.
- Any change to branch-level (top) or entity-level (robot/All Probes/company) row chrome — both keep their current full `CabinetBox`+`Button` styling untouched.
- New trait/color-resolution logic — this pass only consumes what's already resolved.
