# Intent: World Palette Pull (factories & bubbles)

> **Shipped (roadmap Phase 35, 2026-10-02)** — spec [docs/specs/WORLD_PALETTE_PULL.md](../specs/WORLD_PALETTE_PULL.md), plan [docs/tasks/WORLD_PALETTE_PULL.md](../tasks/WORLD_PALETTE_PULL.md). Two visual-checkpoint tunings (warm and lime saturation caps) are recorded in the spec's §1.1 amendments; every decision below held.

Confirmed via `interview-me` on 2026-10-02, ahead of a `spec-driven-development` pass. Refined
from [docs/ideas/world-palette-pull.md](../ideas/world-palette-pull.md); the interview narrowed
that one-pager in two ways recorded below (robots dropped, saturation lift added).

## Outcome

The factories and their bubbles stop reading as grey. Each locale leans its buildings toward one
or two accent hues from the console palette (`ACCENT_COLORS`, `src/constants/accentColors.ts`),
chosen from the Attenuation Style seed, with a modest saturation lift and a hue pull toward that
family. Robots are untouched; their job is to stand out against the now-coherent backdrop.

## Behavior

- **The locale picks one or two accent hues, not one per building.** The choice is seeded from
  the Attenuation Style noise map, the same level the existing additive factory color shift
  (`deriveAsColorShift()`, `src/systems/factoryPlacementSystem.ts`) already hangs from. A row of
  factories reads as one family, never a rainbow.
- **Hue is pulled halfway** toward the chosen accent hue — a soft pull, not a snap and not
  snap-plus-offset. Crawford's reason: the console's semi-transparent panels sit over the world,
  so whatever the world carries bleeds into the UI; a half pull keeps the glass from going
  oversaturated.
- **Saturation is lifted modestly.** The hue pull alone does nothing visible on the 15%-saturation
  graphite body in `src/constants/colorTheme.json` — "very gray" is a saturation problem first.
  The lift is capped by the same glass-overlay concern as the pull.
- **Bubbles follow their building.** `factoryBubbleProps.ts` / `BubbleStream.tsx` already tint
  each stream from the building's shifted body hue; they inherit the new color with no separate
  rule.
- **Retransmitting a new Attenuation Style still recolors factories in place**
  (`recolorFactoriesForAttenuationStyle`, called from `worldTransition.ts`) — the new accent lean
  is part of what changes, not an exception to it.
- **Per-variant hue/sat shift ranges (`factoryVariants.ts`) and the existing ±30° / ±20 pt AS
  shift keep working underneath.** The accent lean is layered on top of today's shift pipeline,
  not a replacement for it.
- **Day/night lighting is unchanged.** `applyColorShift`'s lightness multiplier path is not
  touched; only hue and saturation inputs change.
- **Everything stays seeded and deterministic.** Same style + same coordinates → same colors. Any
  new `getSeededVal` dataId is a new seed key (PROCEDURAL_GENERATION.md's rename caution applies
  from day one).

## Style / constraint

- **Success is judged by eye, not by number**: side by side at the same seed, the new scene is
  visibly less grey, the buildings read as one family that belongs with the console, robots stand
  out against them rather than blending in, and the semi-transparent UI panels over the world do
  not go muddy or oversaturated.
- **The glass overlays set the ceiling.** Both the half pull and the modest lift exist because of
  them. If a value looks too strong behind the console, the value comes down; the mechanism does
  not change.
- Follows the existing precedent of AS-level additive factory color (BUILDING_DESIGN.md "Color
  System", `deriveAsColorShift`) rather than inventing a second theming channel.
- No new state shape beyond whatever the chosen accent lean needs on the factory `Actor`; stays
  JSON-serializable.

## Out of scope

- **Robots — entirely.** Their hue, saturation and the identity-color link move to the
  parametric-robot-hull branch (`docs/ideas/parametric-robot-hull.md`), which rewrites robot
  color mapping anyway. Pulling robot hues toward the same accent family would also weaken the
  contrast this branch is trying to create.
- The Ballast neutrals (`--color-bg`, `--color-surface`, `--color-sleeve`).
- Bubble colors as anything other than their own building's hue.
- Per-building accent variety (each factory choosing its own nearest accent hue) — rejected in
  the interview as the oversaturation risk itself.
- Hard snap or snap-plus-offset — rejected; soft pull is the decision.
- Any change to robot/factory *placement*, variant selection, or greebles.

## Known implementation note (not yet spec'd)

- Exact lift amount and pull fraction (half is the stated intent; the spec should make the
  fraction a named constant and expect it to be tuned by eye).
- One accent hue per locale vs. two, and if two, how buildings split between them (by row? by
  variant? by seeded coin?).
- Where the chosen accent hue(s) live: computed on the fly from the AS noise map at render, or
  stored on each factory `Actor` at placement alongside today's AS `hueShift`/`satShift`
  (recolor-on-retransmit must still work either way).
- Whether to express the lean as a hue *pull* applied after `shiftHSL`, or to fold it into the
  AS shift's own hue/sat deltas — the former is cleaner to reason about and to cap.
- One robot-side check only: confirm the chosen locale accent hue(s) do not swallow robots that
  happen to share the family (visual check, not code).
