# World Palette Pull

> **Shipped (roadmap Phase 35, 2026-10-02)** — see [docs/intent/world-palette-pull.md](../intent/world-palette-pull.md), [docs/specs/WORLD_PALETTE_PULL.md](../specs/WORLD_PALETTE_PULL.md), [docs/tasks/WORLD_PALETTE_PULL.md](../tasks/WORLD_PALETTE_PULL.md). The interview narrowed this one-pager: robots dropped, a saturation lift added, pair per style. This file is kept as the idea-stage record.

Refined 2026-10-02 via the idea-refine skill. First of three sequenced branches:
world-palette-pull → parametric-robot-hull → layer-pods-and-follow-through.

## Problem Statement

How might we make robots, factories and bubbles share the console's hue vocabulary without
flattening the audio-driven and seed-driven variety that makes each world distinct?

## Recommended Direction

One new helper, `pullTowardAccentHue(hsl)`, that blends a hue halfway toward the nearest of the
18 `ACCENT_COLORS` hues (`src/constants/accentColors.ts`) and leaves saturation and lightness
alone. Three call sites adopt it:

- robot `generateColors()` (`src/components/robot/robotVisualHelpers.ts`)
- the factory `applyColorShift` path (`src/components/actors/factoryVariants.ts`, see
  BUILDING_DESIGN.md "Color System")
- the bubble fill, which already inherits the building's body hue
  (`src/components/actors/factoryBubbleProps.ts` / `BubbleStream.tsx`)

Nothing about *what drives* the hue changes, so every existing audio mapping and every seeded
draw stays valid. The world shifts toward the UI palette without snapping to it.

Crawford's call (2026-10-02): **soft pull only** — not hard snap, not snap-plus-offset. Variety
wins over unity here.

## Key Assumptions to Validate

- [ ] A halfway pull is visible at all on the factory palette. The body base in
      `src/constants/colorTheme.json` is 15% saturation, so a hue move there may be invisible.
      Test: render a before/after strip of all five variants at three seeds; if invisible, add a
      saturation floor for buildings only.
- [ ] Pulling robot hue does not collapse two robots in the same waveform family to the same
      color. Test: 12-robot roster across 10 seeds, check minimum hue distance between
      same-family robots.
- [ ] The pull does not fight the Attenuation Style factory shift (`deriveAsColorShift`,
      `factoryPlacementSystem.ts`). Test: retransmitting a new style still visibly recolors
      factories.

## MVP Scope

- The helper and its unit tests.
- The three call sites.
- A before/after screenshot pair at one seed.
- A one-paragraph note in ROBOT_DESIGN.md and BUILDING_DESIGN.md.
- No new state, no new seed draws.

## Not Doing (and Why)

- Hard snap or snap-plus-offset — Crawford chose soft pull; variety over unity.
- Touching the Ballast neutrals (`--color-bg`, `--color-surface`) — they are the backdrop the
  accents pop against, not part of the world palette.
- Pulling bubbles toward anything other than their own building — keeps one hue source per
  factory.
- Changing which audio attribute drives robot hue — belongs to the parametric-robot-hull branch.

## Open Questions

- Apply the pull to the robot's secondary and accent hues too, or only primary (with the other two
  kept at their fixed +14° / −22° offsets from it)? Recommendation: primary only.
